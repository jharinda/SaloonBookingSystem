import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import * as CryptoJS from 'crypto-js';

import {
  Subscription,
  SubscriptionDocument,
  SubscriptionPlan,
} from './schemas/subscription.schema';
import { PlanEntry, PlanEntryDocument } from './schemas/plan-config.schema';
import { PLANS, PlanConfig } from './plans.config';
import {
  GeneratePaymentDto,
  PayhereWebhookDto,
  UpdatePlanConfigDto,
} from './dto/subscription.dto';

const PLANS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SubscriptionService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionService.name);

  /** In-memory cache for plan configs loaded from DB */
  private plansCache: { data: Record<string, PlanConfig>; expiresAt: number } | null = null;

  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(PlanEntry.name)
    private readonly planModel: Model<PlanEntryDocument>,
    private readonly configService: ConfigService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.seedPlansIfEmpty();
  }

  private async seedPlansIfEmpty(): Promise<void> {
    const count = await this.planModel.countDocuments();
    if (count > 0) return;

    const entries = Object.entries(PLANS).map(([key, config]) => ({
      key,
      name: config.name,
      price: config.price,
      trialDays: config.trialDays ?? null,
      maxLocations: config.maxLocations,
      maxStaff: config.maxStaff,
      maxStations: config.maxStations,
      features: [...config.features],
    }));

    await this.planModel.insertMany(entries);
    this.logger.log('Seeded default plan configurations into MongoDB');
  }

  // ── Internal plan map (DB-backed with cache) ──────────────────────────────

  private async getPlansMap(): Promise<Record<string, PlanConfig>> {
    const now = Date.now();
    if (this.plansCache && this.plansCache.expiresAt > now) {
      return this.plansCache.data;
    }

    const dbPlans = await this.planModel.find().lean();
    const map: Record<string, PlanConfig> = {};

    for (const p of dbPlans) {
      map[p.key] = {
        name: p.name,
        price: p.price,
        trialDays: p.trialDays ?? undefined,
        maxLocations: p.maxLocations,
        maxStaff: p.maxStaff,
        maxStations: p.maxStations,
        features: p.features,
      };
    }

    // Fallback to hardcoded defaults when DB is empty
    if (Object.keys(map).length === 0) {
      return PLANS as unknown as Record<string, PlanConfig>;
    }

    this.plansCache = { data: map, expiresAt: now + PLANS_CACHE_TTL_MS };
    return map;
  }

  // ── Public plan helpers ───────────────────────────────────────────────────

  async getAllPlans(): Promise<Record<string, PlanConfig>> {
    return this.getPlansMap();
  }

  async updatePlanConfig(key: string, dto: UpdatePlanConfigDto): Promise<PlanConfig> {
    const updated = await this.planModel.findOneAndUpdate(
      { key },
      { $set: dto },
      { new: true, upsert: false },
    );
    if (!updated) throw new NotFoundException(`Plan '${key}' not found`);

    this.plansCache = null; // invalidate cache
    this.logger.log(`[Admin] Plan config updated: key=${key}`);

    return {
      name: updated.name,
      price: updated.price,
      trialDays: updated.trialDays ?? undefined,
      maxLocations: updated.maxLocations,
      maxStaff: updated.maxStaff,
      maxStations: updated.maxStations,
      features: updated.features,
    };
  }

  // ── Trial ─────────────────────────────────────────────────────────────────

  async startTrial(salonId: string): Promise<SubscriptionDocument> {
    const existing = await this.subscriptionModel.findOne({ salonId });
    if (existing) {
      throw new ConflictException(`Subscription already exists for salon ${salonId}`);
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const subscription = await this.subscriptionModel.create({
      salonId,
      plan: 'starter',
      status: 'trial',
      startDate: now,
      trialEndsAt,
      currentPeriodEnd: null,
      payhereOrderId: null,
      paymentHistory: [],
    });

    this.logger.log(`Trial started for salonId=${salonId}, ends=${trialEndsAt.toISOString()}`);
    return subscription;
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  async getSubscription(salonId: string): Promise<SubscriptionDocument> {
    const sub = await this.subscriptionModel.findOne({ salonId });
    if (!sub) {
      throw new NotFoundException(`No subscription found for salon ${salonId}`);
    }
    return sub;
  }

  // ── PayHere payment generation ────────────────────────────────────────────

  async generatePayherePayment(
    dto: GeneratePaymentDto,
  ): Promise<{ paymentUrl: string; paymentData: Record<string, string> }> {
    const { salonId, plan } = dto;
    const plans = await this.getPlansMap();
    const planConfig = plans[plan];

    if (!planConfig || planConfig.price === 0) {
      throw new ConflictException(`Plan '${plan}' does not require a payment`);
    }

    const merchantId = this.configService.get<string>('payhere.merchantId') ?? '';
    const payhereSecret = this.configService.get<string>('payhere.secret') ?? '';

    const orderId = `SS-${Date.now()}`;
    const amount = planConfig.price.toFixed(2);
    const currency = 'LKR';

    const secretMd5 = CryptoJS.MD5(payhereSecret).toString().toUpperCase();
    const hash = CryptoJS.MD5(merchantId + orderId + amount + currency + secretMd5)
      .toString()
      .toUpperCase();

    const paymentData: Record<string, string> = {
      merchant_id: merchantId,
      return_url: this.configService.get<string>('payhere.returnUrl', 'http://localhost:4200/subscription/success'),
      cancel_url: this.configService.get<string>('payhere.cancelUrl', 'http://localhost:4200/subscription/cancel'),
      notify_url: this.configService.get<string>('payhere.notifyUrl', 'http://localhost:3007/api/subscriptions/webhook'),
      order_id: orderId,
      items: `SnapSalon ${planConfig.name} Plan`,
      currency,
      amount,
      first_name: 'Salon',
      last_name: 'Owner',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: 'Sri Lanka',
      custom_1: salonId,
      custom_2: plan,
      hash,
    };

    await this.subscriptionModel.findOneAndUpdate(
      { salonId },
      { payhereOrderId: orderId },
      { upsert: false },
    );

    return {
      paymentUrl: 'https://sandbox.payhere.lk/pay/checkout',
      paymentData,
    };
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  async handleWebhook(payload: PayhereWebhookDto): Promise<void> {
    const { merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig } =
      payload;

    const payhereSecret = this.configService.get<string>('payhere.secret') ?? '';
    const secretMd5 = CryptoJS.MD5(payhereSecret).toString().toUpperCase();
    const expectedSig = CryptoJS.MD5(
      merchant_id + order_id + payhere_amount + payhere_currency + status_code + secretMd5,
    )
      .toString()
      .toUpperCase();

    if (md5sig !== expectedSig) {
      this.logger.warn(`Webhook signature mismatch for order ${order_id}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log(`Webhook received: orderId=${order_id} status=${status_code}`);

    if (status_code === '2') {
      const salonId = payload.custom_1;
      const plan = (payload.custom_2 ?? 'basic') as SubscriptionPlan;
      const now = new Date();

      const existingSub = await this.subscriptionModel.findOne({ salonId });
      let newPeriodEnd: Date;
      if (existingSub?.currentPeriodEnd && existingSub.currentPeriodEnd > now) {
        newPeriodEnd = new Date(
          existingSub.currentPeriodEnd.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
      } else {
        newPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      await this.subscriptionModel.findOneAndUpdate(
        { salonId },
        {
          plan,
          status: 'active',
          currentPeriodEnd: newPeriodEnd,
          payhereOrderId: order_id,
          $push: {
            paymentHistory: {
              orderId: order_id,
              amount: parseFloat(payhere_amount),
              currency: payhere_currency,
              status: 'SUCCESS',
              paidAt: now,
            },
          },
        },
        { upsert: false },
      );

      this.logger.log(
        `Subscription activated for salonId=${salonId} plan=${plan} until=${newPeriodEnd.toISOString()}`,
      );
    } else {
      this.logger.warn(
        `Payment not successful: orderId=${order_id} status_code=${status_code}`,
      );
    }
  }

  // ── Dev: simulate a paid upgrade ─────────────────────────────────────────

  async simulateUpgrade(salonId: string, plan: SubscriptionPlan): Promise<SubscriptionDocument> {
    const plans = await this.getPlansMap();
    const planConfig = plans[plan];
    if (!planConfig) throw new NotFoundException(`Plan '${plan}' not found`);

    const now = new Date();
    const currentPeriodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const subscription = await this.subscriptionModel.findOneAndUpdate(
      { salonId },
      {
        plan,
        status: 'active',
        currentPeriodEnd,
        $push: {
          paymentHistory: {
            orderId: `SIM-${Date.now()}`,
            amount: planConfig.price,
            currency: 'LKR',
            status: 'SIMULATED',
            paidAt: now,
          },
        },
      },
      { upsert: true, new: true },
    );

    this.logger.log(`[DEV] Simulated upgrade for salonId=${salonId} to plan=${plan}`);
    return subscription;
  }

  // ── Feature access ────────────────────────────────────────────────────────

  async checkFeatureAccess(salonId: string, feature: string): Promise<boolean> {
    const sub = await this.getSubscription(salonId);
    const plans = await this.getPlansMap();
    const planFeatures = plans[sub.plan]?.features ?? [];
    return planFeatures.includes('all') || planFeatures.includes(feature);
  }

  async checkFeature(
    salonId: string,
    feature: string,
  ): Promise<{ allowed: boolean; plan: string; reason?: string }> {
    const plans = await this.getPlansMap();

    try {
      const sub = await this.getSubscription(salonId);
      const planConfig = plans[sub.plan];

      if (sub.status !== 'trial' && sub.status !== 'active') {
        return {
          allowed: false,
          plan: sub.plan,
          reason: `Subscription is ${sub.status}. Please renew your subscription.`,
        };
      }

      const planFeatures = planConfig?.features ?? [];
      const hasFeature = planFeatures.includes('all') || planFeatures.includes(feature);

      if (!hasFeature) {
        return {
          allowed: false,
          plan: sub.plan,
          reason: `Feature '${feature}' is not available in your ${planConfig?.name ?? sub.plan} plan. Please upgrade.`,
        };
      }

      return { allowed: true, plan: sub.plan };
    } catch {
      // No subscription record — auto-start a 30-day trial
      try {
        await this.startTrial(salonId);
        this.logger.log(`Auto-started trial for salonId=${salonId} during feature check`);
        const starterFeatures = plans['starter']?.features ?? [];
        const hasFeature = starterFeatures.includes('all') || starterFeatures.includes(feature);
        return {
          allowed: hasFeature,
          plan: 'starter',
          reason: hasFeature
            ? undefined
            : `Feature '${feature}' is not available in the Starter plan. Please upgrade.`,
        };
      } catch {
        return {
          allowed: false,
          plan: 'none',
          reason: 'No active subscription found. Please start a trial or subscribe.',
        };
      }
    }
  }

  async getPlanLimits(
    salonId: string,
  ): Promise<{ plan: string; maxStaff: number; maxLocations: number; maxStations: number; status: string }> {
    try {
      const sub = await this.getSubscription(salonId);
      const plans = await this.getPlansMap();
      const planConfig = plans[sub.plan];

      return {
        plan: sub.plan,
        maxStaff: planConfig?.maxStaff ?? 3,
        maxLocations: planConfig?.maxLocations ?? 1,
        maxStations: planConfig?.maxStations ?? 2,
        status: sub.status,
      };
    } catch {
      throw new NotFoundException(`No subscription found for salon ${salonId}`);
    }
  }

  /** Renewal UI: days left, expiring-soon flag (matches cron window). */
  async getRenewalStatus(salonId: string): Promise<{
    status: string;
    plan: string;
    currentPeriodEnd: Date | null;
    daysRemaining: number;
    isExpiringSoon: boolean;
  }> {
    const sub = await this.getSubscription(salonId);
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const dayMs = 24 * 60 * 60 * 1000;

    let daysRemaining = 0;
    if (sub.status === 'trial' && sub.trialEndsAt) {
      daysRemaining = Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / dayMs);
    } else if (sub.currentPeriodEnd) {
      daysRemaining = Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / dayMs);
    }

    let isExpiringSoon = false;
    if (
      sub.status === 'trial' &&
      sub.trialEndsAt &&
      sub.trialEndsAt > now &&
      sub.trialEndsAt <= in3Days
    ) {
      isExpiringSoon = true;
    } else if (
      sub.status === 'active' &&
      sub.currentPeriodEnd &&
      sub.currentPeriodEnd > now &&
      sub.currentPeriodEnd <= in3Days
    ) {
      isExpiringSoon = true;
    }

    return {
      status: sub.status,
      plan: sub.plan,
      currentPeriodEnd: sub.currentPeriodEnd,
      daysRemaining,
      isExpiringSoon,
    };
  }

  async getPlanDistribution(): Promise<{
    starter: number;
    basic: number;
    pro: number;
    franchise: number;
    trial: number;
    total: number;
  }> {
    const results = await this.subscriptionModel.aggregate<{ _id: string; count: number }>([
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$status', 'trial'] }, 'trial', '$plan'],
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const dist: Record<string, number> = { starter: 0, basic: 0, pro: 0, franchise: 0, trial: 0 };
    let total = 0;
    for (const r of results) {
      const key = r._id ?? 'starter';
      if (key in dist) dist[key] = r.count;
      total += r.count;
    }

    return {
      starter:   dist['starter'],
      basic:     dist['basic'],
      pro:       dist['pro'],
      franchise: dist['franchise'],
      trial:     dist['trial'],
      total,
    };
  }

  // ── Cron: expiring trials ─────────────────────────────────────────────────

  @Cron('0 9 * * *')
  async checkExpiringTrials(): Promise<void> {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiring = await this.subscriptionModel
      .find({
        status: 'trial',
        trialEndsAt: { $gte: now, $lte: in3Days },
      })
      .lean();

    for (const trial of expiring) {
      this.logger.warn(
        `Trial expiring soon: salonId=${trial.salonId} plan=${trial.plan} trialEndsAt=${trial.trialEndsAt?.toISOString?.() ?? ''}`,
      );
    }
    if (expiring.length > 0) {
      this.logger.warn(
        `[Trials expiring in 3 days] ${expiring.length} salon(s): ${expiring
          .map((s) => s.salonId)
          .join(', ')}`,
      );
    }
    // TODO: send email reminders via notification-service
  }

  @Cron('0 9 * * *')
  async checkExpiringSubscriptions(): Promise<void> {
    const now = new Date();

    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const expiringSoon = await this.subscriptionModel
      .find({
        status: 'active',
        currentPeriodEnd: { $gte: now, $lte: in3Days },
      })
      .lean();

    for (const sub of expiringSoon) {
      this.logger.warn(
        'Subscription expiring soon: salonId=' + sub.salonId + ' plan=' + sub.plan,
      );
      // TODO: emit event to notification queue for renewal reminder email
    }

    const expired = await this.subscriptionModel.updateMany(
      {
        status: 'active',
        currentPeriodEnd: { $lt: now },
      },
      { $set: { status: 'past_due' } },
    );
    if (expired.modifiedCount > 0) {
      this.logger.warn('Marked ' + expired.modifiedCount + ' subscription(s) as past_due');
    }

    const gracePeriodEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cancelled = await this.subscriptionModel.updateMany(
      {
        status: 'past_due',
        currentPeriodEnd: { $lt: gracePeriodEnd },
      },
      { $set: { status: 'cancelled' } },
    );
    if (cancelled.modifiedCount > 0) {
      this.logger.warn(
        'Cancelled ' + cancelled.modifiedCount + ' subscription(s) past grace period',
      );
    }
  }
}

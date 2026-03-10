import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
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
import { PLANS } from './plans.config';
import { GeneratePaymentDto, PayhereWebhookDto } from './dto/subscription.dto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    private readonly configService: ConfigService,
  ) {}

  // ── Public helpers ────────────────────────────────────────────────────────

  getAllPlans() {
    return PLANS;
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

    const merchantId = this.configService.get<string>('payhere.merchantId') ?? '';
    const payhereSecret = this.configService.get<string>('payhere.secret') ?? '';

    const planConfig = PLANS[plan];
    if (!planConfig || planConfig.price === 0) {
      throw new ConflictException(`Plan '${plan}' does not require a payment`);
    }

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

    // Persist the pending order id so we can match the webhook
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
      // Payment success
      const salonId = payload.custom_1;
      const plan = (payload.custom_2 ?? 'basic') as SubscriptionPlan;
      const now = new Date();
      const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await this.subscriptionModel.findOneAndUpdate(
        { salonId },
        {
          plan,
          status: 'active',
          currentPeriodEnd,
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
        `Subscription activated for salonId=${salonId} plan=${plan} until=${currentPeriodEnd.toISOString()}`,
      );
    } else {
      this.logger.warn(
        `Payment not successful: orderId=${order_id} status_code=${status_code}`,
      );
    }
  }

  // ── Feature access ────────────────────────────────────────────────────────

  async checkFeatureAccess(salonId: string, feature: string): Promise<boolean> {
    const sub = await this.getSubscription(salonId);
    const planFeatures = PLANS[sub.plan]?.features ?? [];
    return planFeatures.includes('all') || planFeatures.includes(feature);
  }

  async checkFeature(
    salonId: string,
    feature: string,
  ): Promise<{ allowed: boolean; plan: string; reason?: string }> {
    try {
      const sub = await this.getSubscription(salonId);
      const planConfig = PLANS[sub.plan];

      // Check if subscription is active or in trial
      if (sub.status !== 'trial' && sub.status !== 'active') {
        return {
          allowed: false,
          plan: sub.plan,
          reason: `Subscription is ${sub.status}. Please renew your subscription.`,
        };
      }

      // Check if feature is included in plan
      const planFeatures = planConfig?.features ?? [];
      const hasFeature = planFeatures.includes('all') || planFeatures.includes(feature);

      if (!hasFeature) {
        return {
          allowed: false,
          plan: sub.plan,
          reason: `Feature '${feature}' is not available in your ${planConfig.name} plan. Please upgrade.`,
        };
      }

      return {
        allowed: true,
        plan: sub.plan,
      };
    } catch {
      // Subscription not found
      return {
        allowed: false,
        plan: 'none',
        reason: 'No active subscription found. Please start a trial or subscribe.',
      };
    }
  }

  async getPlanLimits(
    salonId: string,
  ): Promise<{ plan: string; maxStaff: number; maxLocations: number; maxStations: number; status: string }> {
    try {
      const sub = await this.getSubscription(salonId);
      const planConfig = PLANS[sub.plan];

      return {
        plan: sub.plan,
        maxStaff: planConfig.maxStaff,
        maxLocations: planConfig.maxLocations,
        maxStations: planConfig.maxStations,
        status: sub.status,
      };
    } catch {
      throw new NotFoundException(
        `No subscription found for salon ${salonId}`,
      );
    }
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

    if (expiring.length === 0) return;

    this.logger.warn(
      `[Trials expiring in 3 days] ${expiring.length} salon(s): ${expiring
        .map((s) => s.salonId)
        .join(', ')}`,
    );
    // TODO: send email reminders via notification-service
  }
}

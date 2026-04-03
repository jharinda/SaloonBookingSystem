import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { Divider } from 'primeng/divider';
import { MessageService } from 'primeng/api';

import {
  SalonAdminService,
  SubscriptionService,
  PlanFeatureService,
  SubscriptionResponse,
  PlanConfig,
  SubscriptionPlan,
} from '@org/shared-data-access';

const PLAN_ORDER: SubscriptionPlan[] = ['starter', 'basic', 'pro', 'franchise'];

const FEATURE_LABELS: Record<string, string> = {
  basic_booking: 'Booking Management',
  email_notifications: 'Email Notifications',
  sms_notifications: 'SMS Notifications',
  google_calendar: 'Google Calendar Sync',
  whatsapp: 'WhatsApp integration',
  instagram: 'Instagram integration',
  analytics: 'Advanced Analytics',
  priority_support: 'Priority Support',
  all: 'All Features Included',
};

// Ordered list of all possible features for the comparison grid
const ALL_FEATURES = [
  'basic_booking',
  'email_notifications',
  'sms_notifications',
  'google_calendar',
  'whatsapp',
  'instagram',
  'analytics',
  'priority_support',
];

export interface PlanCard {
  key: SubscriptionPlan;
  config: PlanConfig;
  isCurrent: boolean;
  isPopular: boolean;
  planIndex: number;
  currentIndex: number;
}

@Component({
  selector: 'lib-subscription',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, Button, Tag, Message, Skeleton, Divider, DatePipe, DecimalPipe, NgClass],
  templateUrl: './subscription.component.html',
})
export class SubscriptionComponent implements OnInit {
  private readonly adminService    = inject(SalonAdminService);
  private readonly subscriptionSvc = inject(SubscriptionService);
  private readonly planFeature     = inject(PlanFeatureService);
  private readonly messageService  = inject(MessageService);

  readonly isLoading        = signal(true);
  readonly loadError        = signal<string | null>(null);
  readonly upgrading        = signal<SubscriptionPlan | null>(null);
  readonly startingTrial    = signal(false);

  readonly salonId          = signal<string | null>(null);
  readonly subscription     = signal<SubscriptionResponse | null>(null);
  readonly plans            = signal<Record<SubscriptionPlan, PlanConfig> | null>(null);

  readonly planCards = computed<PlanCard[]>(() => {
    const plans = this.plans();
    const sub   = this.subscription();
    if (!plans) return [];

    const currentIndex = sub ? PLAN_ORDER.indexOf(sub.plan) : -1;

    return PLAN_ORDER.map((key, planIndex) => ({
      key,
      config:       plans[key],
      isCurrent:    sub?.plan === key,
      isPopular:    key === 'pro',
      planIndex,
      currentIndex,
    }));
  });

  readonly trialDaysLeft = computed<number | null>(() => {
    const sub = this.subscription();
    if (!sub || sub.status !== 'trial' || !sub.trialEndsAt) return null;
    const ms = new Date(sub.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  });

  readonly statusSeverity = computed<'success' | 'info' | 'warn' | 'danger' | 'secondary'>(() => {
    const status = this.subscription()?.status;
    if (status === 'active')    return 'success';
    if (status === 'trial')     return 'info';
    if (status === 'past_due')  return 'warn';
    if (status === 'cancelled') return 'danger';
    return 'secondary';
  });

  readonly statusLabel = computed<string>(() => {
    const status = this.subscription()?.status;
    if (status === 'active')    return 'Active';
    if (status === 'trial')     return 'Free Trial';
    if (status === 'past_due')  return 'Past Due';
    if (status === 'cancelled') return 'Cancelled';
    return 'Unknown';
  });

  ngOnInit(): void {
    this._load();
  }

  private _load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    this.adminService
      .getDashboardSalon()
      .pipe(
        switchMap((salon) => {
          this.salonId.set(salon._id as string);
          return forkJoin({
            subscription: this.subscriptionSvc
              .getMySubscription(salon._id as string)
              .pipe(catchError(() => of(null))),
            plans: this.subscriptionSvc
              .getPlans()
              .pipe(catchError(() => of(null))),
          });
        }),
      )
      .subscribe({
        next: ({ subscription, plans }) => {
          this.subscription.set(subscription);
          this.plans.set(plans as Record<SubscriptionPlan, PlanConfig> | null);
          this.isLoading.set(false);
        },
        error: () => {
          this.loadError.set('Failed to load subscription data. Please try again.');
          this.isLoading.set(false);
        },
      });
  }

  startTrial(): void {
    const salonId = this.salonId();
    if (!salonId) return;

    this.startingTrial.set(true);
    this.subscriptionSvc.startTrial(salonId).subscribe({
      next: (sub) => {
        this.subscription.set(sub);
        this.startingTrial.set(false);
        this.messageService.add({
          severity: 'success',
          summary:  'Trial Started!',
          detail:   'Your 30-day free trial has begun. Enjoy SnapSalon!',
          life:     5000,
        });
      },
      error: (err) => {
        this.startingTrial.set(false);
        const msg = err?.error?.message ?? 'Could not start trial. Please try again.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 });
      },
    });
  }

  simulateUpgrade(plan: SubscriptionPlan): void {
    const salonId = this.salonId();
    if (!salonId || this.upgrading()) return;

    this.upgrading.set(plan);
    this.subscriptionSvc.simulateUpgrade(salonId, plan).subscribe({
      next: (sub) => {
        this.subscription.set(sub);
        this.upgrading.set(null);
        this.planFeature.reload(); // refresh feature gates across the dashboard
        const planName = this.plans()?.[plan]?.name ?? plan;
        this.messageService.add({
          severity: 'success',
          summary:  'Plan Updated',
          detail:   `Successfully switched to the ${planName} plan.`,
          life:     5000,
        });
      },
      error: () => {
        this.upgrading.set(null);
        this.messageService.add({
          severity: 'error',
          summary:  'Error',
          detail:   'Could not update plan. Please try again.',
          life:     5000,
        });
      },
    });
  }

  hasFeature(plan: PlanCard, feature: string): boolean {
    const features = plan.config.features;
    return features.includes('all') || features.includes(feature);
  }

  formatLimit(val: number): string {
    return val === -1 ? 'Unlimited' : String(val);
  }

  featureLabel(key: string): string {
    return FEATURE_LABELS[key] ?? key;
  }

  readonly allFeatures = ALL_FEATURES;
}

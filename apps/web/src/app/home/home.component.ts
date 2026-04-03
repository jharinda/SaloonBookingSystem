import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

import { Button } from 'primeng/button';

import { PlanConfig, SubscriptionService, SubscriptionPlan } from '@org/shared-data-access';

/** Human-readable feature keys from API */
const FEATURE_LABELS: Record<string, string> = {
  all: 'All premium features',
  basic_booking: 'Online booking',
  email_notifications: 'Email notifications',
  sms_notifications: 'SMS notifications',
  whatsapp: 'WhatsApp integration',
  instagram: 'Instagram integration',
  google_calendar: 'Google Calendar sync',
  analytics: 'Business analytics',
  priority_support: 'Priority support',
};

export interface LandingPlanDisplay {
  key: SubscriptionPlan;
  name: string;
  price: number;
  maxLocations: number;
  maxStaff: number;
  maxStations: number;
  featureLabels: string[];
}

const PLAN_ORDER: SubscriptionPlan[] = ['starter', 'basic', 'pro', 'franchise'];

const FALLBACK_PLANS: Record<SubscriptionPlan, PlanConfig> = {
  starter: {
    name: 'Starter',
    price: 0,
    trialDays: 30,
    maxLocations: 1,
    maxStaff: 3,
    maxStations: 2,
    features: ['basic_booking', 'email_notifications'],
  },
  basic: {
    name: 'Basic',
    price: 2500,
    maxLocations: 1,
    maxStaff: 5,
    maxStations: 3,
    features: ['basic_booking', 'email_notifications', 'sms_notifications', 'google_calendar'],
  },
  pro: {
    name: 'Pro',
    price: 5500,
    maxLocations: 1,
    maxStaff: -1,
    maxStations: 5,
    features: [
      'basic_booking',
      'email_notifications',
      'sms_notifications',
      'whatsapp',
      'instagram',
      'google_calendar',
      'analytics',
      'priority_support',
    ],
  },
  franchise: {
    name: 'Franchise',
    price: 12000,
    maxLocations: 10,
    maxStaff: -1,
    maxStations: -1,
    features: ['all'],
  },
};

function toDisplayPlans(raw: Record<SubscriptionPlan, PlanConfig>): LandingPlanDisplay[] {
  return PLAN_ORDER.map((key) => {
    const p = raw[key];
    const featureLabels = (p.features ?? []).map((f) => FEATURE_LABELS[f] ?? f.replace(/_/g, ' '));
    return {
      key,
      name: p.name,
      price: p.price,
      maxLocations: p.maxLocations,
      maxStaff: p.maxStaff,
      maxStations: p.maxStations,
      featureLabels,
    };
  });
}

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, DecimalPipe],
  templateUrl: './home.component.html',
  styles: [
    `
      :host {
        display: block;
        min-height: 100%;
      }
    `,
  ],
})
export class HomeComponent implements OnInit {
  private readonly subscriptionService = inject(SubscriptionService);

  readonly plansLoading = signal(true);
  private readonly plansSource = signal<Record<SubscriptionPlan, PlanConfig> | null>(null);

  readonly displayPlans = computed(() => {
    const src = this.plansSource();
    const raw = src ?? FALLBACK_PLANS;
    return toDisplayPlans(raw);
  });

  readonly clientSteps = [
    {
      icon: 'pi pi-search',
      title: 'Search',
      body: 'Browse salons by location, service, or rating — find the right fit in seconds.',
    },
    {
      icon: 'pi pi-calendar',
      title: 'Book',
      body: 'Pick a time that works for you and confirm in a few taps. No phone tag.',
    },
    {
      icon: 'pi pi-star',
      title: 'Enjoy',
      body: 'Show up and relax. Manage or reschedule your visit anytime from your account.',
    },
  ];

  readonly ownerBenefits = [
    {
      icon: 'pi pi-calendar-plus',
      title: 'Manage bookings online',
      body: 'Accept, reschedule, and track appointments from one dashboard — fewer no-shows, less chaos.',
    },
    {
      icon: 'pi pi-users',
      title: 'Reach new clients',
      body: 'Get discovered by clients searching SnapSalon across Sri Lanka.',
    },
    {
      icon: 'pi pi-chart-line',
      title: 'Track your business',
      body: 'See what’s working with staff performance and revenue insights on Pro plans.',
    },
  ];

  ngOnInit(): void {
    this.subscriptionService
      .getPlans()
      .pipe(catchError(() => of(null)))
      .subscribe((plans) => {
        this.plansSource.set(plans);
        this.plansLoading.set(false);
      });
  }

  formatLimitLabel(label: string, n: number): string {
    const v = n === -1 ? 'Unlimited' : String(n);
    return `${label}: ${v}`;
  }
}

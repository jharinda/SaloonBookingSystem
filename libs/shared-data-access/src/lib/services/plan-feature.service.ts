import { inject, Injectable, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { SalonAdminService } from './salon-admin.service';
import { SubscriptionService, PlanConfig, SubscriptionPlan } from './subscription.service';

const PLAN_ORDER: SubscriptionPlan[] = ['starter', 'basic', 'pro', 'franchise'];

@Injectable({ providedIn: 'root' })
export class PlanFeatureService {
  private readonly adminSvc = inject(SalonAdminService);
  private readonly subSvc   = inject(SubscriptionService);

  /** null while loading — hasFeature() fails open (returns true) until resolved */
  private readonly _features    = signal<string[] | null>(null);
  private readonly _currentPlan = signal<SubscriptionPlan | null>(null);
  private readonly _plans       = signal<Record<string, PlanConfig> | null>(null);

  private _initialized = false;

  readonly currentPlan = this._currentPlan.asReadonly();

  /**
   * Load the active plan features for the current salon owner.
   * Safe to call multiple times — subsequent calls are no-ops.
   * Call this from any salon-dashboard component that needs feature gating.
   */
  load(): void {
    if (this._initialized) return;
    this._initialized = true;

    this.adminSvc
      .getDashboardSalon()
      .pipe(
        switchMap((salon) =>
          forkJoin({
            sub:   this.subSvc.getMySubscription(salon._id as string).pipe(catchError(() => of(null))),
            plans: this.subSvc.getPlans().pipe(catchError(() => of(null))),
          }),
        ),
        catchError(() => of({ sub: null, plans: null })),
      )
      .subscribe(({ sub, plans }) => {
        this._plans.set(plans);
        if (sub && plans) {
          this._currentPlan.set(sub.plan);
          this._features.set(plans[sub.plan]?.features ?? []);
        } else {
          // No subscription yet — restrict all gated features until trial starts
          this._currentPlan.set(null);
          this._features.set([]);
        }
      });
  }

  /** Re-load after a plan change (e.g. after simulate upgrade). */
  reload(): void {
    this._initialized = false;
    this._features.set(null);
    this._currentPlan.set(null);
    this._plans.set(null);
    this.load();
  }

  /**
   * Returns true if the current plan includes this feature.
   * Returns true while loading so UI doesn't flash locked briefly.
   */
  hasFeature(feature: string): boolean {
    const features = this._features();
    if (features === null) return true; // fail-open while loading
    return features.includes('all') || features.includes(feature);
  }

  /**
   * Returns the display name of the lowest plan tier that includes this feature.
   * e.g. "Pro" for analytics, "Basic" for google_calendar.
   */
  requiredPlanFor(feature: string): string {
    const plans = this._plans();
    if (!plans) return 'a higher';

    for (const key of PLAN_ORDER) {
      const features = plans[key]?.features ?? [];
      if (features.includes('all') || features.includes(feature)) {
        return plans[key]?.name ?? key;
      }
    }
    return 'a higher';
  }

  /** Reset (on logout or salon change). */
  reset(): void {
    this._initialized = false;
    this._features.set(null);
    this._currentPlan.set(null);
    this._plans.set(null);
  }
}

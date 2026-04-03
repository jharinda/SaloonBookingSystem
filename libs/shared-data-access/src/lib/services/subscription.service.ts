import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export type SubscriptionPlan = 'starter' | 'basic' | 'pro' | 'franchise';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled';

export interface PaymentHistoryEntry {
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string;
}

export interface SubscriptionResponse {
  _id: string;
  salonId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startDate: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  paymentHistory: PaymentHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanConfig {
  name: string;
  /** Monthly price in LKR; 0 = free */
  price: number;
  trialDays?: number;
  /** -1 = unlimited */
  maxLocations: number;
  /** -1 = unlimited */
  maxStaff: number;
  /** -1 = unlimited */
  maxStations: number;
  features: string[];
}

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly http = inject(HttpClient);

  /**
   * GET /api/subscriptions/my?salonId=:salonId
   * Returns null when no subscription exists yet (404 is treated as null).
   */
  getMySubscription(salonId: string): Observable<SubscriptionResponse | null> {
    return this.http
      .get<SubscriptionResponse>('/api/subscriptions/my', { params: { salonId } })
      .pipe(catchError(() => of(null)));
  }

  /** GET /api/subscriptions/plans */
  getPlans(): Observable<Record<SubscriptionPlan, PlanConfig>> {
    return this.http.get<Record<SubscriptionPlan, PlanConfig>>('/api/subscriptions/plans');
  }

  /** GET /api/subscriptions/:salonId/plan-limits */
  getPlanLimits(salonId: string): Observable<{
    plan: string;
    maxStaff: number;
    maxLocations: number;
    maxStations: number;
    status: string;
  }> {
    return this.http.get<{
      plan: string;
      maxStaff: number;
      maxLocations: number;
      maxStations: number;
      status: string;
    }>(`/api/subscriptions/${salonId}/plan-limits`);
  }

  /** POST /api/subscriptions/trial — starts a 30-day free trial */
  startTrial(salonId: string): Observable<SubscriptionResponse> {
    return this.http.post<SubscriptionResponse>('/api/subscriptions/trial', { salonId });
  }

  /**
   * POST /api/subscriptions/simulate-upgrade
   * DEV MODE — immediately activates a plan without real payment.
   */
  simulateUpgrade(salonId: string, plan: SubscriptionPlan): Observable<SubscriptionResponse> {
    return this.http.post<SubscriptionResponse>('/api/subscriptions/simulate-upgrade', {
      salonId,
      plan,
    });
  }
}

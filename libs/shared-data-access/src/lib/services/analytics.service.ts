import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

/** Matches booking-service `SalonAnalyticsResponseDto` */
export interface SalonAnalyticsResponse {
  salonId: string;
  period: { from: string; to: string };
  totalRevenue: number;
  totalBookings: number;
  completionRate: number;
  averageBookingValue: number;
  dailyRevenue: Array<{ date: string; revenue: number; count: number }>;
  statusBreakdown: {
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  peakHours: Array<{ hour: number; count: number }>;
  topServices: Array<{ serviceName: string; count: number; revenue: number }>;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/bookings/analytics';

  getSalonAnalytics(
    salonId: string,
    from?: string,
    to?: string,
  ): Observable<SalonAnalyticsResponse> {
    let params = new HttpParams().set('salonId', salonId);
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<SalonAnalyticsResponse>(
      `${this.baseUrl}/salon/${salonId}`,
      { params },
    );
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Booking, BookedServicePayload, CreateBookingPayload, SlotsResponse } from '@org/models';

// ── Client Analytics ─────────────────────────────────────────────────────────

export interface ClientAnalytics {
  totalBookings: number;
  totalSpent: number;
  averageBookingValue: number;
  visitFrequency: number;
  favoriteServices: Array<{ serviceName: string; count: number }>;
  favoriteSalons: Array<{
    salonId: string;
    salonName: string;
    visitCount: number;
    lastServiceIds: string[];
  }>;
  monthlySpending: Array<{ month: string; total: number }>;
  lastVisit: string | null;
}

// ── Normalisation ────────────────────────────────────────────────────────────

/** Map backend booking shape (id, appointmentDate as ISO string) → Booking */
function normBooking(b: Booking & { id?: string; appointmentDate?: unknown }): Booking {
  return {
    ...b,
    _id: b._id || (b as { id?: string }).id || '',
    appointmentDate:
      typeof b.appointmentDate === 'string'
        ? (b.appointmentDate as string).substring(0, 10)
        : String(b.appointmentDate ?? ''),
  };
}

// ── Public DTOs ──────────────────────────────────────────────────────────────

/** Canonical type for creating a booking — matches the backend CreateBookingDto. */
export type CreateBookingDto = CreateBookingPayload;

export interface CancelBookingDto {
  reason?: string;
}

export interface ModifyBookingDto {
  services?: BookedServicePayload[];
  stylistId?: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);

  /**
   * GET /api/bookings/slots
   * Returns available and unavailable time slots for the given parameters.
   */
  getAvailableSlots(
    salonId: string,
    date: string,
    durationMinutes: number,
    stylistId?: string,
  ): Observable<SlotsResponse> {
    let params = new HttpParams()
      .set('salonId', salonId)
      .set('date', date)
      .set('durationMinutes', String(durationMinutes));

    if (stylistId) params = params.set('stylistId', stylistId);

    // The API returns { salonId, date, slots: string[] } (only available time strings).
    // We normalise to SlotsResponse { date, slots: BookingSlot[] } so consumers
    // can treat every returned slot as available.
    return this.http
      .get<{ salonId: string; date: string; slots: string[] }>('/api/bookings/slots', { params })
      .pipe(
        map((resp) => ({
          date: resp.date,
          slots: resp.slots.map((time) => ({ time, available: true })),
        })),
      );
  }

  /**
   * POST /api/bookings
   * Creates a new booking and returns the persisted Booking document.
   */
  createBooking(dto: CreateBookingDto): Observable<Booking> {
    return this.http.post<Booking>('/api/bookings', dto).pipe(
      map(normBooking),
    );
  }

  /**
   * GET /api/bookings/my
   * Returns all bookings for the currently authenticated user.
   */
  getMyBookings(): Observable<Booking[]> {
    return this.http
      .get<{ data: Booking[] } | Booking[]>('/api/bookings/my')
      .pipe(
        map((res) => {
          const list = Array.isArray(res) ? res : (res as { data: Booking[] }).data ?? [];
          return list.map(normBooking);
        }),
      );
  }

  /**
   * PATCH /api/bookings/:id/cancel
   * Cancels a booking and returns the updated Booking document.
   */
  cancelBooking(id: string, reason?: string): Observable<Booking> {
    return this.http
      .patch<Booking>(`/api/bookings/${id}/cancel`, { reason })
      .pipe(map(normBooking));
  }

  /**
   * GET /api/bookings/:id
   * Returns a single booking by ID (used by the success screen).
   */
  getById(id: string): Observable<Booking> {
    return this.http
      .get<Booking>(`/api/bookings/${id}`)
      .pipe(map(normBooking));
  }

  /**
   * GET /api/bookings/breaks/stylists-on-break?salonId=&date=&time=&durationMinutes=
   * Returns the IDs of stylists who have at least one break overlapping the
   * given time slot on the specified date.
   * When time/duration are omitted, returns all stylists with any break that day.
   * Used by the booking wizard to visually disable on-break stylists.
   */
  getStylistsOnBreak(
    salonId: string,
    date: string,
    time?: string,
    durationMinutes?: number,
  ): Observable<string[]> {
    let params = new HttpParams()
      .set('salonId', salonId)
      .set('date', date);

    if (time) params = params.set('time', time);
    if (durationMinutes) params = params.set('durationMinutes', String(durationMinutes));

    return this.http
      .get<{ stylistIds: string[] }>('/api/bookings/breaks/stylists-on-break', { params })
      .pipe(map((res) => res.stylistIds));
  }

  /**
   * PATCH /api/bookings/:id/modify
   * Modifies services, stylist, or notes on an existing PENDING / CONFIRMED booking.
   */
  modifyBooking(id: string, dto: ModifyBookingDto): Observable<Booking> {
    return this.http
      .patch<Booking>(`/api/bookings/${id}/modify`, dto)
      .pipe(map(normBooking));
  }

  /**
   * GET /api/bookings/analytics/me
   * Returns personal booking analytics for the authenticated client.
   */
  getMyAnalytics(): Observable<ClientAnalytics> {
    return this.http.get<ClientAnalytics>('/api/bookings/analytics/me');
  }
}

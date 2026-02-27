import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Booking, CreateBookingPayload, SlotsResponse } from '@org/models';

// ── Public DTOs ──────────────────────────────────────────────────────────────

/** Alias that matches the wizard's schema — use instead of CreateBookingPayload
 *  to stay consistent with the shared-data-access naming convention. */
export type CreateBookingDto = CreateBookingPayload & { stylistId?: string };

export interface CancelBookingDto {
  reason?: string;
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
      .set('duration', String(durationMinutes));

    if (stylistId) params = params.set('stylistId', stylistId);

    return this.http.get<SlotsResponse>('/api/bookings/slots', { params });
  }

  /**
   * POST /api/bookings
   * Creates a new booking and returns the persisted Booking document.
   */
  createBooking(dto: CreateBookingDto): Observable<Booking> {
    return this.http.post<Booking>('/api/bookings', dto);
  }

  /**
   * GET /api/bookings/my
   * Returns all bookings for the currently authenticated user.
   */
  getMyBookings(): Observable<Booking[]> {
    return this.http.get<Booking[]>('/api/bookings/my');
  }

  /**
   * PATCH /api/bookings/:id/cancel
   * Cancels a booking and returns the updated Booking document.
   */
  cancelBooking(id: string, reason?: string): Observable<Booking> {
    return this.http.patch<Booking>(`/api/bookings/${id}/cancel`, { reason });
  }

  /**
   * GET /api/bookings/:id
   * Returns a single booking by ID (used by the success screen).
   */
  getById(id: string): Observable<Booking> {
    return this.http.get<Booking>(`/api/bookings/${id}`);
  }
}

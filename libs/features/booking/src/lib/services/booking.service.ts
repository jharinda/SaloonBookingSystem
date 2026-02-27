import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Booking, CreateBookingPayload, SlotsResponse } from '@org/models';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3002/api';

  /**
   * GET /bookings/slots
   * Returns available and unavailable time slots for the given parameters.
   */
  getSlots(salonId: string, date: string, duration: number): Observable<SlotsResponse> {
    const params = new HttpParams()
      .set('salonId', salonId)
      .set('date', date)
      .set('duration', String(duration));

    return this.http.get<SlotsResponse>(`${this.apiUrl}/bookings/slots`, { params });
  }

  /**
   * POST /bookings
   * Creates a new booking and returns the persisted Booking document.
   */
  createBooking(payload: CreateBookingPayload): Observable<Booking> {
    return this.http.post<Booking>(`${this.apiUrl}/bookings`, payload);
  }

  /**
   * GET /bookings/:id
   * Returns a single booking by ID.
   */
  getById(id: string): Observable<Booking> {
    return this.http.get<Booking>(`${this.apiUrl}/bookings/${id}`);
  }
}

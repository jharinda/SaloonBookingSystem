import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Booking, Salon, SalonServiceItem, SalonWorkingHours } from '@org/models';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface AddServiceDto {
  name: string;
  description?: string;
  category: string;
  price: number;
  duration: number;
  active?: boolean;
}

export type UpdateOperatingHoursDto = Record<string, SalonWorkingHours>;

export interface CreateSalonAddressDto {
  street: string;
  city: string;
  province: string;
  lat: number;
  lng: number;
}

export interface CreateSalonDto {
  name: string;
  description?: string;
  phone: string;
  email: string;
  address: CreateSalonAddressDto;
}

export interface UpdateSalonInfoDto {
  name?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: {
    street: string;
    city: string;
    province: string;
    lat?: number;
    lng?: number;
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SalonAdminService {
  private readonly http = inject(HttpClient);

  /** GET /api/salons/owner/me — returns the authenticated owner's first salon */
  getOwnSalon(): Observable<Salon> {
    return this.http.get<Salon[]>('/api/salons/owner/me').pipe(
      map((salons) => {
        if (!salons.length) {
          throw new HttpErrorResponse({ status: 404, statusText: 'Not Found' });
        }
        return salons[0];
      }),
    );
  }

  /** POST /api/salons — creates a new salon for the authenticated owner */
  createSalon(dto: CreateSalonDto): Observable<Salon> {
    return this.http.post<Salon>('/api/salons', dto);
  }

  /** PATCH /api/salons/:id — updates basic info (name, description, phone, email, address) */
  updateSalon(salonId: string, dto: UpdateSalonInfoDto): Observable<Salon> {
    return this.http.patch<Salon>(`/api/salons/${salonId}`, dto);
  }

  /** GET /api/bookings?salonId=:id&date=today */
  getTodayBookings(salonId: string): Observable<Booking[]> {
    return this.http.get<Booking[]>('/api/bookings', {
      params: { salonId, date: 'today' },
    });
  }

  /** GET /api/bookings?salonId=:id&startDate=:start&endDate=:end */
  getBookingsByRange(salonId: string, startDate: string, endDate: string): Observable<Booking[]> {
    return this.http.get<Booking[]>('/api/bookings', {
      params: { salonId, startDate, endDate },
    });
  }

  /** PATCH /api/bookings/:id/confirm */
  confirmBooking(bookingId: string): Observable<Booking> {
    return this.http.patch<Booking>(`/api/bookings/${bookingId}/confirm`, {});
  }

  /** PATCH /api/bookings/:id/complete */
  completeBooking(bookingId: string): Observable<Booking> {
    return this.http.patch<Booking>(`/api/bookings/${bookingId}/complete`, {});
  }

  /** PATCH /api/bookings/:id/cancel */
  cancelBooking(bookingId: string, reason?: string): Observable<Booking> {
    return this.http.patch<Booking>(`/api/bookings/${bookingId}/cancel`, { reason });
  }

  /** POST /api/salons/:id/services */
  addService(salonId: string, dto: AddServiceDto): Observable<SalonServiceItem> {
    return this.http.post<SalonServiceItem>(`/api/salons/${salonId}/services`, dto);
  }

  /** PATCH /api/salons/:id/services/:serviceId */
  updateService(
    salonId: string,
    serviceId: string,
    dto: Partial<AddServiceDto>,
  ): Observable<SalonServiceItem> {
    return this.http.patch<SalonServiceItem>(
      `/api/salons/${salonId}/services/${serviceId}`,
      dto,
    );
  }

  /** DELETE /api/salons/:id/services/:serviceId */
  deleteService(salonId: string, serviceId: string): Observable<void> {
    return this.http.delete<void>(`/api/salons/${salonId}/services/${serviceId}`);
  }

  /** PATCH /api/salons/:id/operating-hours */
  updateOperatingHours(
    salonId: string,
    dto: UpdateOperatingHoursDto,
  ): Observable<Salon> {
    return this.http.patch<Salon>(`/api/salons/${salonId}/operating-hours`, dto);
  }
}

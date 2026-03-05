import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

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

/** Shape of a single image entry as returned by the salon-service API */
export interface SalonImage {
  cloudinaryId: string;
  url: string;
  isPrimary?: boolean;
}

/** Response from POST /api/salons/upload */
export interface UploadImageResult {
  cloudinaryId: string;
  url: string;
}

/** Shape of a service item as returned by the salon-service API */
interface ApiServiceItem {
  id?: string;
  _id?: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  duration: number;
  active?: boolean;
}

interface ApiOperatingHours {
  day: number;   // 0 = Sunday … 6 = Saturday
  open: string;
  close: string;
  closed: boolean;
}

/** Shape of the API salon response (services use `id`, not `_id`) */
interface ApiSalon extends Omit<Salon, 'services' | 'workingHours'> {
  id?: string;
  services: ApiServiceItem[];
  operatingHours?: ApiOperatingHours[];
}

/** Normalise a raw API service item to the SalonServiceItem shape */
function normService(s: ApiServiceItem): SalonServiceItem {
  return { ...s, _id: (s._id ?? s.id ?? '') } as SalonServiceItem;
}

/** Normalise a raw booking returned by the API:
 * - maps `id` → `_id`
 * - trims ISO appointmentDate to YYYY-MM-DD
 * - derives `serviceName` from services[0].name when not set
 */
function normAdminBooking(
  b: Booking & { id?: string; appointmentDate?: unknown; services?: Array<{ name?: string }> },
): Booking {
  return {
    ...b,
    _id: b._id || b.id || '',
    appointmentDate:
      typeof b.appointmentDate === 'string'
        ? (b.appointmentDate as string).substring(0, 10)
        : String(b.appointmentDate ?? ''),
    serviceName: b.serviceName || b.services?.[0]?.name || '',
  } as Booking;
}

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
    const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
    return this.http.get<ApiSalon[]>('/api/salons/owner/me').pipe(
      map((salons) => {
        if (!salons.length) {
          throw new HttpErrorResponse({ status: 404, statusText: 'Not Found' });
        }
        const s = salons[0];
        // Convert operatingHours array → workingHours record the form expects
        const workingHours: Record<string, import('@org/models').SalonWorkingHours> = {};
        for (const h of s.operatingHours ?? []) {
          const name = DAY_NAMES[h.day];
          if (name) workingHours[name] = { isOpen: !h.closed, open: h.open, close: h.close };
        }
        return {
          ...s,
          _id:          s._id ?? s.id,
          services:     (s.services ?? []).map(normService),
          workingHours: Object.keys(workingHours).length ? workingHours : undefined,
          images:       (s.images as unknown as import('@org/models').SalonImage[]) ?? [],
        } as Salon;
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

  /** GET /api/bookings?salonId=:id&startDate=today&endDate=today */
  getTodayBookings(salonId: string): Observable<Booking[]> {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return this.http
      .get<{ data: Booking[] }>('/api/bookings', {
        params: { salonId, startDate: dateStr, endDate: dateStr },
      })
      .pipe(map((res) => (res.data ?? []).map(normAdminBooking)));
  }

  /** GET /api/bookings?salonId=:id&startDate=:start&endDate=:end */
  getBookingsByRange(salonId: string, startDate: string, endDate: string): Observable<Booking[]> {
    return this.http
      .get<{ data: Booking[] }>('/api/bookings', {
        params: { salonId, startDate, endDate },
      })
      .pipe(map((res) => (res.data ?? []).map(normAdminBooking)));
  }

  /** PATCH /api/bookings/:id/confirm */
  confirmBooking(bookingId: string): Observable<Booking> {
    return this.http
      .patch<Booking>(`/api/bookings/${bookingId}/confirm`, {})
      .pipe(map(normAdminBooking));
  }

  /** PATCH /api/bookings/:id/complete */
  completeBooking(bookingId: string): Observable<Booking> {
    return this.http
      .patch<Booking>(`/api/bookings/${bookingId}/complete`, {})
      .pipe(map(normAdminBooking));
  }

  /** PATCH /api/bookings/:id/cancel */
  cancelBooking(bookingId: string, reason?: string): Observable<Booking> {
    return this.http
      .patch<Booking>(`/api/bookings/${bookingId}/cancel`, { reason })
      .pipe(map(normAdminBooking));
  }

  /** POST /api/salons/:id/services — returns updated services list */
  addService(salonId: string, dto: AddServiceDto): Observable<SalonServiceItem[]> {
    return this.http
      .post<ApiSalon>(`/api/salons/${salonId}/services`, dto)
      .pipe(map((salon) => (salon.services ?? []).map(normService)));
  }

  /** PATCH /api/salons/:id/services/:serviceId — returns updated services list */
  updateService(
    salonId: string,
    serviceId: string,
    dto: Partial<AddServiceDto>,
  ): Observable<SalonServiceItem[]> {
    return this.http
      .patch<ApiSalon>(`/api/salons/${salonId}/services/${serviceId}`, dto)
      .pipe(map((salon) => (salon.services ?? []).map(normService)));
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

  // ── Image management ───────────────────────────────────────────────────────

  /**
   * POST /api/salons/upload — uploads a file to Cloudinary via the API gateway,
   * then PATCHes the resulting { cloudinaryId, url } into the salon's images array.
   */
  uploadSalonImage(salonId: string, file: File): Observable<Salon> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<UploadImageResult>('/api/salons/upload', form)
      .pipe(switchMap((result) => this.pushImage(salonId, result)));
  }

  /** PATCH /api/salons/:id/images — appends { cloudinaryId, url } to the images array */
  pushImage(salonId: string, body: { cloudinaryId: string; url: string }): Observable<Salon> {
    return this.http.patch<Salon>(`/api/salons/${salonId}/images`, body);
  }

  /** DELETE /api/salons/:id/images/:cloudinaryId — removes an image by its Cloudinary ID */
  removeImage(salonId: string, cloudinaryId: string): Observable<Salon> {
    return this.http.delete<Salon>(`/api/salons/${salonId}/images/${encodeURIComponent(cloudinaryId)}`);
  }

  /** PATCH /api/salons/:id/images/:imageId/primary — marks an image as the primary one */
  setPrimaryImage(salonId: string, imageId: string): Observable<Salon> {
    return this.http.patch<Salon>(`/api/salons/${salonId}/images/${imageId}/primary`, {});
  }
}

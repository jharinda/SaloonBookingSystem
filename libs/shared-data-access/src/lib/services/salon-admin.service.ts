import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import type { PaginatedBookingsPage } from '../types/paginated-bookings';

import { Booking, Salon, SalonServiceItem, SalonWorkingHours } from '@org/models';
import type { StylistBreakDto } from './user.service';
import { SalonService } from './salon.service';

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

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** Normalise one ApiSalon (owner/me, franchise list, POST responses) to Salon */
function normalizeApiSalon(s: ApiSalon): Salon {
  const workingHours: Record<string, SalonWorkingHours> = {};
  for (const h of s.operatingHours ?? []) {
    const name = DAY_NAMES[h.day];
    if (name) workingHours[name] = { isOpen: !h.closed, open: h.open, close: h.close };
  }
  return {
    ...s,
    _id: s._id ?? s.id ?? '',
    services: (s.services ?? []).map(normService),
    workingHours: Object.keys(workingHours).length ? workingHours : undefined,
    images: (s.images as unknown as import('@org/models').SalonImage[]) ?? [],
  } as Salon;
}

/** sessionStorage key — selected branch for franchise owners */
export const SALON_DASHBOARD_BRANCH_ID_KEY = 'salonDashboardSelectedSalonId';

/** Aggregated franchise metrics from GET /api/salons/franchise/overview */
export interface FranchiseOverview {
  totalBranches: number;
  totalStaff: number;
  averageRating: number;
  totalRevenue: number;
  activeTodayCount: number;
  branches: Salon[];
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
  autoConfirmBookings?: boolean;
  cancellationWindowHours?: number;
  breakLimits?: { LUNCH?: number; COFFEE?: number; PERSONAL?: number; OTHER?: number };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SalonAdminService {
  private readonly http = inject(HttpClient);
  private readonly salonService = inject(SalonService);

  /** @deprecated use {@link SALON_DASHBOARD_BRANCH_ID_KEY} */
  static readonly DASHBOARD_SALON_ID_KEY = SALON_DASHBOARD_BRANCH_ID_KEY;

  /**
   * Persists selected branch for franchise owners (session). Clears when null.
   */
  setDashboardSalonId(salonId: string | null): void {
    if (typeof sessionStorage === 'undefined') return;
    if (salonId) sessionStorage.setItem(SALON_DASHBOARD_BRANCH_ID_KEY, salonId);
    else sessionStorage.removeItem(SALON_DASHBOARD_BRANCH_ID_KEY);
  }

  /**
   * Active salon for dashboard UIs: branch from session when set, otherwise first from owner/me.
   */
  getDashboardSalon(): Observable<Salon> {
    if (typeof sessionStorage !== 'undefined') {
      const id = sessionStorage.getItem(SALON_DASHBOARD_BRANCH_ID_KEY);
      if (id) {
        return this.salonService.getSalonById(id);
      }
    }
    return this.getOwnSalon();
  }

  /** GET /api/salons/owner/me — returns the authenticated owner's first salon */
  getOwnSalon(): Observable<Salon> {
    return this.http.get<ApiSalon[]>('/api/salons/owner/me').pipe(
      map((salons) => {
        if (!salons.length) {
          throw new HttpErrorResponse({ status: 404, statusText: 'Not Found' });
        }
        return normalizeApiSalon(salons[0]);
      }),
    );
  }

  /** GET /api/salons/franchise/branches */
  getFranchiseBranches(): Observable<Salon[]> {
    return this.http.get<ApiSalon[]>('/api/salons/franchise/branches').pipe(
      map((salons) => salons.map((s) => normalizeApiSalon(s))),
    );
  }

  /** GET /api/salons/franchise/overview */
  getFranchiseOverview(): Observable<FranchiseOverview> {
    return this.http
      .get<
        Omit<FranchiseOverview, 'branches'> & { branches: ApiSalon[] }
      >('/api/salons/franchise/overview')
      .pipe(
        map((o) => ({
          ...o,
          branches: (o.branches ?? []).map((s) => normalizeApiSalon(s)),
        })),
      );
  }

  /** POST /api/salons/franchise/branches — add a branch (franchise plan limits apply server-side) */
  addFranchiseBranch(dto: CreateSalonDto): Observable<Salon> {
    return this.http.post<ApiSalon>('/api/salons/franchise/branches', dto).pipe(
      map((s) => normalizeApiSalon(s)),
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
        params: { salonId, startDate, endDate, limit: '100' },
      })
      .pipe(map((res) => (res.data ?? []).map(normAdminBooking)));
  }

  /** GET /api/bookings — paginated salon bookings with optional stylist/service filters */
  getPaginatedBookings(params: {
    salonId: string;
    startDate: string;
    endDate: string;
    stylistId?: string;
    serviceId?: string;
    page?: number;
    limit?: number;
    /** Default API sort is by appointment; pass `createdAt` + `desc` for newest records first */
    sortBy?: 'appointment' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  }): Observable<PaginatedBookingsPage> {
    let p = new HttpParams()
      .set('salonId', params.salonId)
      .set('startDate', params.startDate)
      .set('endDate', params.endDate)
      .set('limit', String(params.limit ?? 20))
      .set('page', String(params.page ?? 1));
    if (params.stylistId) p = p.set('stylistId', params.stylistId);
    if (params.serviceId) p = p.set('serviceId', params.serviceId);
    if (params.sortBy) p = p.set('sortBy', params.sortBy);
    if (params.sortOrder) p = p.set('sortOrder', params.sortOrder);
    return this.http
      .get<{
        data: Booking[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>('/api/bookings', { params: p })
      .pipe(
        map((res) => ({
          data: (res.data ?? []).map(normAdminBooking),
          total: res.total,
          page: res.page,
          limit: res.limit,
          totalPages: res.totalPages,
        })),
      );
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

  /** PATCH /api/bookings/:id/station — reassign a booking to a different station */
  assignStation(salonId: string, bookingId: string, stationId: string): Observable<Booking> {
    return this.http
      .patch<Booking>(`/api/bookings/${bookingId}/station`, { stationId })
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

  // ── Station management ─────────────────────────────────────────────────────

  /** GET /api/salons/:id/stations */
  getStations(salonId: string): Observable<{ stations: Station[]; stationCount: number }> {
    return this.http.get<{ stations: Station[]; stationCount: number }>(`/api/salons/${salonId}/stations`);
  }

  /** POST /api/salons/:id/stations — creates a new station */
  addStation(salonId: string, name: string): Observable<Salon> {
    return this.http.post<Salon>(`/api/salons/${salonId}/stations`, { name });
  }

  /** PATCH /api/salons/:id/stations/:stationId — updates station name/status */
  updateStation(salonId: string, stationId: string, dto: { name?: string; isActive?: boolean }): Observable<Salon> {
    return this.http.patch<Salon>(`/api/salons/${salonId}/stations/${stationId}`, dto);
  }

  /** DELETE /api/salons/:id/stations/:stationId */
  deleteStation(salonId: string, stationId: string): Observable<Salon> {
    return this.http.delete<Salon>(`/api/salons/${salonId}/stations/${stationId}`);
  }

  // ── Staff management ────────────────────────────────────────────────────

  /** GET /api/auth/salons/:salonId/staff — get approved staff for this salon */
  getSalonStaff(salonId: string): Observable<SalonStaffMember[]> {
    return this.http.get<SalonStaffMember[]>(`/api/auth/salons/${salonId}/staff`);
  }

  /** GET /api/users/email/:email — search for a user by email */
  searchUserByEmail(email: string): Observable<StylistSearchResult | null> {
    return this.http.get<StylistSearchResult | null>(`/api/users/email/${encodeURIComponent(email)}`);
  }

  /** POST /api/salons/:salonId/staff/:stylistId — add a staff member directly */
  addStaff(salonId: string, stylistId: string): Observable<Salon> {
    return this.http.post<Salon>(`/api/salons/${salonId}/staff/${stylistId}`, {});
  }

  /** DELETE /api/salons/:salonId/staff/:stylistId — remove a staff member */
  removeStaff(salonId: string, stylistId: string): Observable<Salon> {
    return this.http.delete<Salon>(`/api/salons/${salonId}/staff/${stylistId}`);
  }

  /** POST /api/auth/salon/invite-stylist — send invitation to a stylist */
  inviteStylist(stylistId: string, salonId: string, salonName: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/salon/invite-stylist', {
      stylistId,
      salonId,
      salonName,
    });
  }

  /** GET /api/auth/salon/:salonId/sent-invitations — get all invitations sent by this salon */
  getSentInvitations(salonId: string): Observable<SentInvitationDto[]> {
    return this.http.get<SentInvitationDto[]>(`/api/auth/salon/${salonId}/sent-invitations`);
  }

  /** GET /api/auth/stylist/join-requests?salonId= — get pending join requests */
  getJoinRequests(salonId: string): Observable<JoinRequestDto[]> {
    return this.http.get<JoinRequestDto[]>('/api/auth/stylist/join-requests', {
      params: { salonId },
    });
  }

  /** PATCH /api/auth/stylist/join-requests/:stylistId/approve */
  approveJoinRequest(stylistId: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(
      `/api/auth/stylist/join-requests/${stylistId}/approve`,
      {},
    );
  }

  /** PATCH /api/auth/stylist/join-requests/:stylistId/reject */
  rejectJoinRequest(stylistId: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(
      `/api/auth/stylist/join-requests/${stylistId}/reject`,
      {},
    );
  }

  // ── Manual Booking (salon owner) ─────────────────────────────────────────

  /** GET /api/users/search/clients?q=<query> — search clients by name, email, or phone */
  searchClients(query: string): Observable<ClientSearchResult[]> {
    return this.http.get<ClientSearchResult[]>('/api/users/search/clients', {
      params: { q: query },
    });
  }

  /** POST /api/bookings/manual — create a booking on behalf of a client */
  createManualBooking(dto: CreateManualBookingDto): Observable<Booking> {
    return this.http
      .post<Booking>('/api/bookings/manual', dto)
      .pipe(map(normAdminBooking));
  }

  // ── Stylist Breaks (salon owner view) ─────────────────────────────────────

  /** GET /api/bookings/salon/:salonId/breaks?date=YYYY-MM-DD */
  getSalonStylistBreaks(salonId: string, date: string): Observable<StylistBreakDto[]> {
    return this.http.get<StylistBreakDto[]>(`/api/bookings/salon/${salonId}/breaks`, {
      params: { date },
    });
  }

  /** GET /api/salons/:salonId/staff-analytics — stylist performance aggregates */
  getStaffAnalytics(salonId: string): Observable<StaffAnalyticsResponse> {
    return this.http.get<StaffAnalyticsResponse>(
      `/api/salons/${salonId}/staff-analytics`,
    );
  }
}

export interface Station {
  _id: string;
  name: string;
  isActive: boolean;
}

/** Shape returned by GET /api/auth/salons/:salonId/staff */
export interface SalonStaffMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
  stylistProfile?: {
    bio?: string;
    specialties: string[];
    yearsExperience: number;
    averageRating?: number;
  };
}

/** Shape returned by GET /api/users/email/:email */
export interface StylistSearchResult {
  _id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: string;
  stylistProfile?: {
    bio?: string;
    specialties: string[];
    yearsExperience: number;
    currentSalonId?: string;
    joinRequestStatus: string;
  };
}

/** Shape returned by GET /api/users/search/clients */
export interface ClientSearchResult {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface CreateManualBookingDto {
  clientId: string;
  clientName: string;
  salonId: string;
  salonName?: string;
  stylistId?: string;
  services: Array<{
    serviceId: string;
    name: string;
    price: number;
    durationMinutes: number;
  }>;
  appointmentDate: string;
  startTime: string;
  notes?: string;
}

/** Shape returned by GET /api/auth/stylist/join-requests */
export interface JoinRequestDto {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
  stylistProfile: {
    bio?: string;
    specialties: string[];
    yearsExperience: number;
    portfolioImages: Array<{ cloudinaryId: string; url: string; caption?: string }>;
    joinRequestStatus: string;
  };
  createdAt: string;
}

/** Shape returned by GET /api/auth/salon/:salonId/sent-invitations */
export interface SentInvitationDto {
  stylistId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
  status: 'pending' | 'accepted' | 'rejected';
  invitedAt: string;
  respondedAt?: string;
}

/** salon-service `StaffAnalyticsItemDto` */
export interface StaffAnalyticsItem {
  stylistId: string;
  name: string;
  avatarUrl?: string;
  totalAppointments: number;
  completedAppointments: number;
  cancellationRate: number;
  averageRating: number;
  totalReviews: number;
  revenueGenerated: number;
  topServices: Array<{ serviceName: string; count: number }>;
  appointmentsByMonth: Array<{ month: string; count: number }>;
}

/** salon-service `StaffAnalyticsResponseDto` */
export interface StaffAnalyticsResponse {
  salonId: string;
  staff: StaffAnalyticsItem[];
  generatedAt: string;
}

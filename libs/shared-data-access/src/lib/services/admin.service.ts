import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// ── DTOs / response shapes ────────────────────────────────────────────────────

export interface AdminStats {
  totalSalons:      number;
  pendingApproval:  number;
  totalClients:     number;
  bookingsToday:    number;
  monthlyRevenue:   number;
  totalBookings?:   number;
  completionRate?:  number;
  revenueBySalon?:  Array<{ salonId: string; salonName: string; revenue: number }>;
  /** Percentage change vs last period */
  trends?: {
    totalSalons:     number;
    pendingApproval: number;
    totalClients:    number;
    bookingsToday:   number;
    monthlyRevenue:  number;
  };
}

export interface SubscriptionDistribution {
  starter:   number;
  basic:     number;
  pro:       number;
  franchise: number;
  trial:     number;
  total:     number;
}

export interface AdminSalon {
  _id:             string;
  /** Alias returned by some backend versions */
  id?:             string;
  name:            string;
  ownerName:       string;
  ownerEmail:      string;
  city:            string;
  submittedAt:     string;
  isApproved:      boolean;
  isActive:        boolean;
  rating:          number;
  subscriptionPlan?: string;
}

export interface AdminSalonsPage {
  data:  AdminSalon[];
  total: number;
  page:  number;
  limit: number;
}

export interface AdminUser {
  _id:       string;
  id?:       string;
  firstName: string;
  lastName:  string;
  email:     string;
  role:      string;
  isActive:  boolean;
  createdAt: string;
}

export interface AdminUsersPage {
  data:  AdminUser[];
  total: number;
  page:  number;
  limit: number;
}

export interface AdminReview {
  _id:        string;
  id?:        string;
  salonName:  string;
  clientName: string;
  rating:     number;
  comment:    string;
  isVisible:  boolean;
  createdAt:  string;
}

export interface AdminReviewsPage {
  data:  AdminReview[];
  total: number;
  page:  number;
  limit: number;
}

// ─────────────────────────────────────────────────────────────────────────────

// ── ID normalisation ────────────────────────────────────────────────────────
// The backend may return either `id` (SalonResponseDto) or `_id` (AdminSalonDto).
// Normalise to `_id` so the rest of the frontend is consistent.
function normId<T extends { _id?: string; id?: string }>(item: T): T {
  return { ...item, _id: item._id || item.id || '' };
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  // ── Stats ─────────────────────────────────────────────────────────────────
  getStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>('/api/admin/stats');
  }

  // ── Salon approvals ───────────────────────────────────────────────────────
  getPendingSalons(): Observable<AdminSalon[]> {
    return this.http.get<AdminSalonsPage>('/api/admin/salons', {
      params: { status: 'pending', limit: '100' },
    }).pipe(map((page) => page.data.map(normId)));
  }

  approveSalon(id: string): Observable<void> {
    return this.http.post<void>(`/api/salons/${id}/approve`, {});
  }

  rejectSalon(id: string, reason: string): Observable<void> {
    return this.http.post<void>(`/api/salons/${id}/reject`, { reason });
  }

  // ── All salons ────────────────────────────────────────────────────────────
  getAllSalons(params: {
    page?:   number;
    limit?:  number;
    search?: string;
    status?: string;
  }): Observable<AdminSalonsPage> {
    let q = new HttpParams();
    if (params.page  !== undefined) q = q.set('page',   params.page.toString());
    if (params.limit !== undefined) q = q.set('limit',  params.limit.toString());
    if (params.search)              q = q.set('search', params.search);
    if (params.status && params.status !== 'all') q = q.set('status', params.status);
    return this.http.get<AdminSalonsPage>('/api/admin/salons', { params: q }).pipe(
      map((page) => ({ ...page, data: page.data.map(normId) })),
    );
  }

  suspendSalon(id: string): Observable<void> {
    return this.http.patch<void>(`/api/salons/${id}`, { isActive: false });
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  getUsers(params: {
    page?:  number;
    limit?: number;
    role?:  string;
  }): Observable<AdminUsersPage> {
    let q = new HttpParams();
    if (params.page  !== undefined) q = q.set('page',  params.page.toString());
    if (params.limit !== undefined) q = q.set('limit', params.limit.toString());
    if (params.role && params.role !== 'all') q = q.set('role', params.role);
    return this.http.get<AdminUsersPage>('/api/admin/users', { params: q }).pipe(
      map((page) => ({ ...page, data: page.data.map(normId) })),
    );
  }

  suspendUser(id: string): Observable<void> {
    return this.http.patch<void>(`/api/admin/users/${id}/suspend`, {});
  }

  // ── Reviews ───────────────────────────────────────────────────────────────
  getAllReviews(params: {
    page?:  number;
    limit?: number;
  }): Observable<AdminReviewsPage> {
    let q = new HttpParams();
    if (params.page  !== undefined) q = q.set('page',  params.page.toString());
    if (params.limit !== undefined) q = q.set('limit', params.limit.toString());
    return this.http.get<AdminReviewsPage>('/api/admin/reviews', { params: q }).pipe(
      map((page) => ({ ...page, data: page.data.map(normId) })),
    );
  }

  removeReview(id: string): Observable<void> {
    return this.http.delete<void>(`/api/reviews/${id}`);
  }

  // ── Specialties management ─────────────────────────────────────────

  getSpecialties(): Observable<AdminSpecialty[]> {
    return this.http.get<AdminSpecialty[]>('/api/salons/specialties/all');
  }

  createSpecialty(dto: CreateSpecialtyDto): Observable<AdminSpecialty> {
    return this.http.post<AdminSpecialty>('/api/salons/specialties', dto);
  }

  updateSpecialty(id: string, dto: Partial<CreateSpecialtyDto>): Observable<AdminSpecialty> {
    return this.http.patch<AdminSpecialty>(`/api/salons/specialties/${id}`, dto);
  }

  deleteSpecialty(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/salons/specialties/${id}`);
  }

  // ── Plan management ───────────────────────────────────────────────────────

  /** GET /api/subscriptions/admin/plan-distribution — subscription breakdown */
  getSubscriptionDistribution(): Observable<SubscriptionDistribution> {
    return this.http.get<SubscriptionDistribution>('/api/subscriptions/admin/plan-distribution');
  }

  /** GET /api/subscriptions/plans — returns all plan configs from DB */
  getPlansConfig(): Observable<Record<string, AdminPlanConfig>> {
    return this.http.get<Record<string, AdminPlanConfig>>('/api/subscriptions/plans');
  }

  /** PATCH /api/subscriptions/admin/plans/:key — update a plan's config */
  updatePlanConfig(key: string, dto: AdminUpdatePlanDto): Observable<AdminPlanConfig> {
    return this.http.patch<AdminPlanConfig>(`/api/subscriptions/admin/plans/${key}`, dto);
  }
}

export interface AdminPlanConfig {
  name: string;
  price: number;
  trialDays?: number | null;
  maxLocations: number;
  maxStaff: number;
  maxStations: number;
  features: string[];
}

export interface AdminUpdatePlanDto {
  name?: string;
  price?: number;
  maxLocations?: number;
  maxStaff?: number;
  maxStations?: number;
  trialDays?: number | null;
  features?: string[];
}

export interface AdminSpecialty {
  _id: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
}

export interface CreateSpecialtyDto {
  name: string;
  description?: string;
  category?: string;
}

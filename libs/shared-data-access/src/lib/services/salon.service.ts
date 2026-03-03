import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Salon, SalonSearchResponse } from '@org/models';

// ── Public search params ────────────────────────────────────────────────────

export interface SearchParams {
  q?: string;
  lat?: number;
  lng?: number;
  city?: string;
  service?: string;
  page?: number;
  limit?: number;
}

/** Normalise backend `id` → `_id` so the rest of the frontend is consistent. */
function normSalonId(s: Salon & { id?: string }): Salon {
  return { ...s, _id: s._id || s.id || '' };
}

@Injectable({ providedIn: 'root' })
export class SalonService {
  private readonly http = inject(HttpClient);

  /**
   * Full-text + geo + category search.
   * GET /api/salons/search
   */
  searchSalons(params: SearchParams): Observable<SalonSearchResponse> {
    let p = new HttpParams();
    if (params.q)            p = p.set('q', params.q);
    if (params.city)         p = p.set('city', params.city);
    if (params.service)      p = p.set('service', params.service);
    if (params.lat != null)  p = p.set('lat', String(params.lat));
    if (params.lng != null)  p = p.set('lng', String(params.lng));
    if (params.page)         p = p.set('page', String(params.page));
    if (params.limit)        p = p.set('limit', String(params.limit));

    // The backend returns { salons: [...], total, page, totalPages }.
    // Normalise to the SalonSearchResponse shape { data: [...], total, page, limit }.
    // Also normalise id → _id since SalonResponseDto uses `id` but the Salon interface uses `_id`.
    return this.http.get<{ salons: Salon[]; total: number; page: number; totalPages: number }>(
      '/api/salons/search', { params: p }
    ).pipe(
      map((res) => ({
        data:  (res.salons ?? []).map(normSalonId),
        total: res.total,
        page:  res.page,
        limit: params.limit ?? 10,
      })),
    );
  }

  /**
   * Returns salons flagged as featured by the API.
   * GET /api/salons/featured
   */
  getFeaturedSalons(): Observable<Salon[]> {
    return this.http.get<Salon[]>('/api/salons/featured').pipe(
      map((salons) => salons.map(normSalonId)),
    );
  }

  /**
   * Fetch a single salon by ID.
   * GET /api/salons/:id
   */
  getSalonById(id: string): Observable<Salon> {
    return this.http.get<Salon>(`/api/salons/${id}`);
  }
}

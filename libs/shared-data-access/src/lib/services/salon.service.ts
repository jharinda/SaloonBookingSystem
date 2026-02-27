import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

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

    return this.http.get<SalonSearchResponse>('/api/salons/search', { params: p });
  }

  /**
   * Returns salons flagged as featured by the API.
   * GET /api/salons?featured=true
   */
  getFeaturedSalons(): Observable<Salon[]> {
    const params = new HttpParams().set('featured', 'true');
    return this.http.get<Salon[]>('/api/salons', { params });
  }

  /**
   * Fetch a single salon by ID.
   * GET /api/salons/:id
   */
  getSalonById(id: string): Observable<Salon> {
    return this.http.get<Salon>(`/api/salons/${id}`);
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  Salon,
  SalonSearchQuery,
  SalonSearchResponse,
} from '@org/models';

@Injectable({ providedIn: 'root' })
export class SalonService {
  private readonly http = inject(HttpClient);
  /** Base URL for the salon microservice */
  private readonly apiUrl = 'http://localhost:3001/api';

  /**
   * Full-text + geo + category search.
   * Maps to GET /salons/search on the salon-service.
   */
  search(query: SalonSearchQuery): Observable<SalonSearchResponse> {
    let params = new HttpParams();

    if (query.q)              params = params.set('q', query.q);
    if (query.city)           params = params.set('city', query.city);
    if (query.service)        params = params.set('service', query.service);
    if (query.lat != null)    params = params.set('lat', String(query.lat));
    if (query.lng != null)    params = params.set('lng', String(query.lng));
    if (query.radius != null) params = params.set('radius', String(query.radius));
    if (query.page)           params = params.set('page', String(query.page));
    if (query.limit)          params = params.set('limit', String(query.limit));

    return this.http.get<SalonSearchResponse>(`${this.apiUrl}/salons/search`, { params });
  }

  /** Fetch a single salon by ID. */
  getById(id: string): Observable<Salon> {
    return this.http.get<Salon>(`${this.apiUrl}/salons/${id}`);
  }
}

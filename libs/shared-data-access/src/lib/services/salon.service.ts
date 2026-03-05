import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Salon, SalonImage, SalonOperatingHours, SalonSearchResponse, SalonWorkingHours } from '@org/models';

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

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;

/** Convert the backend operatingHours array to the workingHours record the UI expects. */
function normOperatingHours(raw: SalonOperatingHours[]): Record<string, SalonWorkingHours> {
  const wh: Record<string, SalonWorkingHours> = {};
  for (const h of raw) {
    const name = DAY_NAMES[h.day];
    if (name) wh[name] = { isOpen: !h.closed, open: h.open, close: h.close };
  }
  return wh;
}

/** Normalise backend `id` → `_id`, map operatingHours → workingHours,
 * and coerce legacy string images to SalonImage objects. */
function normSalon(s: Salon & { id?: string; operatingHours?: SalonOperatingHours[] }): Salon {
  const rawOh = s.operatingHours ?? [];
  const wh = rawOh.length ? normOperatingHours(rawOh) : (s.workingHours ?? undefined);
  const services = (s.services ?? []).map((svc) => {
    const item = svc as typeof svc & { id?: string };
    return { ...item, _id: item._id || item.id || '' };
  });
  // Normalise images: backend returns objects {cloudinaryId,url,isPrimary};
  // legacy data or search results might return plain URL strings — coerce both.
  // Also guard against nested url objects from Cloudinary SDK.
  const images: SalonImage[] = (s.images ?? []).map((img) => {
    if (typeof img === 'string') return { cloudinaryId: '', url: img, isPrimary: false };
    const raw = img as SalonImage & { url: unknown };
    const url =
      typeof raw.url === 'string'
        ? raw.url
        : (raw.url as Record<string, string> | undefined)?.['secure_url'] ??
          (raw.url as Record<string, string> | undefined)?.['url'] ??
          '';
    return { cloudinaryId: raw.cloudinaryId || '', url, isPrimary: raw.isPrimary ?? false };
  });
  return { ...s, _id: s._id || s.id || '', operatingHours: rawOh, workingHours: wh, services, images };
}

/** @deprecated use normSalon */
function normSalonId(s: Salon & { id?: string }): Salon {
  return normSalon(s as Salon & { id?: string; operatingHours?: SalonOperatingHours[] });
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
        data:  (res.salons ?? []).map(normSalon),
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
      map((salons) => salons.map(normSalon)),
    );
  }

  /**
   * Fetch a single salon by ID.
   * GET /api/salons/:id
   */
  getSalonById(id: string): Observable<Salon> {
    return this.http.get<Salon & { operatingHours?: SalonOperatingHours[] }>(`/api/salons/${id}`).pipe(
      map(normSalon),
    );
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CalendarAuthUrlResponse {
  /** Google OAuth2 consent-screen URL */
  url: string;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);

  /**
   * GET /api/calendar/auth
   * Returns the Google OAuth2 redirect URL.
   * The caller should set `window.location.href` to it.
   */
  getGoogleAuthUrl(): Observable<CalendarAuthUrlResponse> {
    return this.http.get<CalendarAuthUrlResponse>('/api/calendar/auth');
  }

  /**
   * GET /api/calendar/download/:bookingId
   * Returns a raw .ics file as a Blob suitable for direct download.
   */
  downloadIcs(bookingId: string): Observable<Blob> {
    return this.http.get(`/api/calendar/download/${bookingId}`, {
      responseType: 'blob',
    });
  }
}

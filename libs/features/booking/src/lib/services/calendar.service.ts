import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

interface AuthUrlResponse {
  /** Google OAuth2 consent-screen URL */
  url: string;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);
  private readonly calendarApiUrl = 'http://localhost:3003/api';

  /**
   * GET /calendar/auth
   * Returns the Google OAuth2 redirect URL.
   * The client should window.location.href to it.
   */
  getGoogleAuthUrl(): Observable<AuthUrlResponse> {
    return this.http.get<AuthUrlResponse>(`${this.calendarApiUrl}/calendar/auth`);
  }

  /**
   * GET /calendar/download/:bookingId
   * Returns a raw .ics file as a Blob for download.
   */
  downloadIcs(bookingId: string): Observable<Blob> {
    return this.http.get(`${this.calendarApiUrl}/calendar/download/${bookingId}`, {
      responseType: 'blob',
    });
  }
}

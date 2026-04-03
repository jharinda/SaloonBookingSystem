import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WaitlistServiceItem {
  serviceId: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface JoinWaitlistPayload {
  salonId: string;
  appointmentDate: string;
  preferredStartTime: string;
  preferredEndTime: string;
  stylistId?: string;
  services: WaitlistServiceItem[];
}

export type WaitlistStatus = 'waiting' | 'notified' | 'booked' | 'expired';

export interface WaitlistEntry {
  id: string;
  clientId: string;
  salonId: string;
  appointmentDate: string;
  preferredStartTime: string;
  preferredEndTime: string;
  stylistId: string | null;
  services: WaitlistServiceItem[];
  status: WaitlistStatus;
  notifiedAt: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class WaitlistService {
  private readonly http = inject(HttpClient);

  /**
   * POST /api/bookings/waitlist
   * Joins the waitlist for a fully-booked time slot.
   */
  joinWaitlist(payload: JoinWaitlistPayload): Observable<WaitlistEntry> {
    return this.http.post<WaitlistEntry>('/api/bookings/waitlist', payload);
  }

  /**
   * GET /api/bookings/waitlist/my
   * Returns active waitlist entries for the current user.
   */
  getMyWaitlist(): Observable<WaitlistEntry[]> {
    return this.http.get<WaitlistEntry[]>('/api/bookings/waitlist/my');
  }

  /**
   * DELETE /api/bookings/waitlist/:id
   * Removes the client from a specific waitlist entry.
   */
  leaveWaitlist(entryId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/bookings/waitlist/${entryId}`);
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Booking } from '@org/models';

export interface UserProfile {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: string;
  currency?: string;
  createdAt: string;
  stylistProfile?: {
    bio?: string;
    specialties: string[];
    yearsExperience: number;
    currentSalonId?: string | null;
    joinRequestStatus: string;
    isAvailable: boolean;
  };
}

export interface UpdateProfileDto {
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
}

export interface ConnectedAccounts {
  google?: { email: string };
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);

  /** GET /api/users/me */
  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>('/api/users/me');
  }

  /** PATCH /api/users/me */
  updateProfile(dto: UpdateProfileDto): Observable<UserProfile> {
    return this.http.patch<UserProfile>('/api/users/me', dto);
  }

  /** PATCH /api/users/me/avatar — multipart FormData */
  updateAvatar(formData: FormData): Observable<{ avatarUrl: string }> {
    return this.http.patch<{ avatarUrl: string }>('/api/users/me/avatar', formData);
  }

  /** POST /api/auth/change-password */
  changePassword(dto: ChangePasswordDto): Observable<void> {
    return this.http.post<void>('/api/auth/change-password', dto);
  }

  /** PATCH /api/users/me/notifications */
  updateNotificationPreferences(
    prefs: Partial<NotificationPreferences>
  ): Observable<NotificationPreferences> {
    return this.http.patch<NotificationPreferences>('/api/users/me/notifications', prefs);
  }

  /** GET /api/users/me/connected-accounts */
  getConnectedAccounts(): Observable<ConnectedAccounts> {
    return this.http.get<ConnectedAccounts>('/api/users/me/connected-accounts');
  }

  /** DELETE /api/auth/google */
  disconnectGoogle(): Observable<void> {
    return this.http.delete<void>('/api/auth/google');
  }

  /** DELETE /api/users/me */
  deleteAccount(): Observable<void> {
    return this.http.delete<void>('/api/users/me');
  }

  // ── Stylist salon invitations ──────────────────────────────────────────

  /** GET /api/auth/stylist/invitations */
  getStylistInvitations(): Observable<SalonInvitationDto[]> {
    return this.http.get<SalonInvitationDto[]>('/api/auth/stylist/invitations');
  }

  /** PATCH /api/auth/stylist/invitations/:salonId/accept */
  acceptInvitation(salonId: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(
      `/api/auth/stylist/invitations/${salonId}/accept`,
      {},
    );
  }

  /** PATCH /api/auth/stylist/invitations/:salonId/reject */
  rejectInvitation(salonId: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(
      `/api/auth/stylist/invitations/${salonId}/reject`,
      {},
    );
  }

  // ── Stylist profile update ──────────────────────────────────────────

  /** PATCH /api/users/me/stylist-profile */
  updateStylistProfile(dto: UpdateStylistProfileDto): Observable<UserProfile> {
    return this.http.patch<UserProfile>('/api/users/me/stylist-profile', dto);
  }

  // ── Specialties ─────────────────────────────────────────────────────

  /** GET /api/salons/specialties — public list of active specialties */
  getSpecialties(): Observable<SpecialtyDto[]> {
    return this.http.get<SpecialtyDto[]>('/api/salons/specialties');
  }

  // ── Stylist bookings ────────────────────────────────────────────────

  /** GET /api/bookings/stylist/me — bookings assigned to the current stylist */
  getStylistBookings(startDate: string, endDate: string): Observable<Booking[]> {
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('limit', '100');

    return this.http
      .get<{ data: Booking[] } | Booking[]>('/api/bookings/stylist/me', { params })
      .pipe(
        map((res) => {
          const list = Array.isArray(res) ? res : (res as { data: Booking[] }).data ?? [];
          return list.map((b) => ({
            ...b,
            _id: b._id || (b as unknown as { id?: string }).id || '',
            appointmentDate:
              typeof b.appointmentDate === 'string'
                ? b.appointmentDate.substring(0, 10)
                : String(b.appointmentDate ?? ''),
          }));
        }),
      );
  }

  // ── Stylist breaks ──────────────────────────────────────────────────

  /** GET /api/bookings/stylist/me/breaks?date=YYYY-MM-DD */
  getStylistBreaks(date: string): Observable<StylistBreakDto[]> {
    return this.http.get<StylistBreakDto[]>('/api/bookings/stylist/me/breaks', {
      params: new HttpParams().set('date', date),
    });
  }

  /** POST /api/bookings/stylist/me/breaks */
  createStylistBreak(dto: CreateStylistBreakPayload): Observable<StylistBreakDto> {
    return this.http.post<StylistBreakDto>('/api/bookings/stylist/me/breaks', dto);
  }

  /** DELETE /api/bookings/stylist/me/breaks/:id */
  deleteStylistBreak(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/bookings/stylist/me/breaks/${id}`);
  }
}

export interface SalonInvitationDto {
  salonId: string;
  salonName: string;
  status: string;
  invitedAt: string;
  respondedAt?: string;
}

export interface UpdateStylistProfileDto {
  bio?: string;
  specialties?: string[];
  yearsExperience?: number;
}

export interface SpecialtyDto {
  _id: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
}

export type BreakType = 'LUNCH' | 'COFFEE' | 'PERSONAL' | 'OTHER';

export interface StylistBreakDto {
  _id: string;
  stylistId: string;
  salonId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: BreakType;
  note: string;
}

export interface CreateStylistBreakPayload {
  salonId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: BreakType;
  note?: string;
}

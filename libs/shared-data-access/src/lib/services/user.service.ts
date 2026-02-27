import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UserProfile {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
}

export interface UpdateProfileDto {
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface NotificationPreferences {
  emailBookingConfirmations: boolean;
  emailReminders: boolean;
  smsReminders: boolean;
  whatsappMessages: boolean;
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
}

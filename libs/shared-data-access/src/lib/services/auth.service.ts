import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { jwtDecode } from 'jwt-decode';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
}

export interface AuthResponse {
  accessToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // ── State ──────────────────────────────────────────────────────────────────
  private readonly accessToken = signal<string | null>(null);

  // ── Public derived state ───────────────────────────────────────────────────
  readonly isLoggedIn = computed(() => !!this.accessToken());

  readonly currentUser = computed<JwtPayload | null>(() => {
    const token = this.accessToken();
    if (!token) return null;
    try {
      return jwtDecode<JwtPayload>(token);
    } catch {
      return null;
    }
  });

  // ── Methods ────────────────────────────────────────────────────────────────

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password } satisfies LoginDto)
      .pipe(
        tap((res) => this.accessToken.set(res.accessToken)),
      );
  }

  register(dto: RegisterDto): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/register', dto)
      .pipe(
        tap((res) => this.accessToken.set(res.accessToken)),
      );
  }

  logout(): Observable<void> {
    return this.http
      .post<void>('/api/auth/logout', {}, { withCredentials: true })
      .pipe(
        tap({
          next: () => this.accessToken.set(null),
          error: () => this.accessToken.set(null), // clear even on failure
        }),
      );
  }

  refreshToken(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/refresh', {}, { withCredentials: true })
      .pipe(
        tap((res) => this.accessToken.set(res.accessToken)),
      );
  }

  /**
   * Called once at app startup to silently restore a session from the
   * HttpOnly refresh-token cookie. Errors are swallowed — the user simply
   * remains unauthenticated if no valid cookie is present.
   */
  initAuth(): Observable<void> {
    return this.refreshToken().pipe(
      catchError(() => of(null)),
      map(() => void 0),
    );
  }

  /** Returns the role claim from the current JWT, or null if not authenticated. */
  getUserRole(): string | null {
    return this.currentUser()?.role ?? null;
  }

  /** Exposes the raw token for the HTTP interceptor. */
  getAccessToken(): string | null {
    return this.accessToken();
  }
}

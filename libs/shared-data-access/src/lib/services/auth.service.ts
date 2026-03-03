import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
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

  /** Shared in-flight refresh observable — prevents concurrent refresh races. */
  private refreshInProgress$: Observable<AuthResponse> | null = null;

  // ── Public derived state ───────────────────────────────────────────────────
  readonly isLoggedIn = computed(() => !!this.accessToken());

  /** True when the in-memory JWT exists but its exp claim is in the past. */
  readonly isTokenExpired = computed<boolean>(() => {
    const user = this.currentUser();
    if (!user) return true;
    return user.exp * 1000 < Date.now();
  });

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

  /**
   * Clears the in-memory access token immediately without making any HTTP
   * request.  Used by the auth interceptor when a token refresh fails so we
   * do not create a circular request loop (logout → 401 → refresh → logout).
   */
  clearToken(): void {
    this.accessToken.set(null);
  }

  refreshToken(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/refresh', {}, { withCredentials: true })
      .pipe(
        tap((res) => this.accessToken.set(res.accessToken)),
      );
  }

  /**
   * Ensures a single refresh request is in flight at any time.
   * If multiple callers (e.g. parallel 401 retries) invoke this concurrently,
   * they all subscribe to the same shared observable and receive the same
   * new access token without issuing duplicate refresh HTTP requests.
   */
  ensureFreshToken(): Observable<AuthResponse> {
    if (!this.refreshInProgress$) {
      this.refreshInProgress$ = this.http
        .post<AuthResponse>('/api/auth/refresh', {}, { withCredentials: true })
        .pipe(
          tap((res) => this.accessToken.set(res.accessToken)),
          // finalize BEFORE shareReplay so it runs once when the HTTP source
          // completes/errors, not once per subscriber unsubscription.
          finalize(() => { this.refreshInProgress$ = null; }),
          shareReplay(1),
        );
    }
    return this.refreshInProgress$;
  }

  /**
   * Called once at app startup to silently restore a session from the
   * HttpOnly refresh-token cookie. Errors are swallowed — the user simply
   * remains unauthenticated if no valid cookie is present.
   */
  initAuth(): Observable<void> {
    return this.ensureFreshToken().pipe(
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

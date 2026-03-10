import {
  DestroyRef,
  Injectable,
  OnDestroy,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Subject, catchError, distinctUntilChanged, filter, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export interface RealtimeNotification {
  event: string;
  data: unknown;
}

/** Exponential backoff delays: 1s → 2s → 4s → 8s → 16s → 30s (capped). */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS  = 30_000;

/**
 * Maintains a persistent SSE connection to /api/notifications/stream for the
 * authenticated user.  Automatic behaviours:
 *
 * - Opens when the user logs in; closes on logout.
 * - On JWT expiry: silently refreshes the token then reconnects.
 * - On network error: reconnects with exponential back-off (1 s → 30 s cap).
 *
 * Because browser EventSource cannot send custom headers, the access token is
 * passed as a `?token=` query parameter.  The API-gateway middleware accepts
 * this fallback only for this specific path.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeNotificationService implements OnDestroy {
  private readonly authService    = inject(AuthService);
  private readonly platformId     = inject(PLATFORM_ID);
  private readonly destroyRef     = inject(DestroyRef);

  private es: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  private readonly _notifications$ = new Subject<RealtimeNotification>();
  /** Stream of real-time events pushed by the server. */
  readonly notifications$ = this._notifications$.asObservable();

  constructor() {
    // EventSource only exists in the browser; guard against SSR.
    if (!isPlatformBrowser(this.platformId)) return;

    // ── React to login / logout ──────────────────────────────────────────────
    toObservable(this.authService.isLoggedIn)
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((loggedIn) => {
        if (loggedIn) {
          this.openConnection();
        } else {
          this.closeConnection();
        }
      });

    // ── Re-connect when the JWT expires while the user is still logged in ────
    // isTokenExpired transitions false→true when the access-token's exp claim
    // lapses.  We piggyback on the existing ensureFreshToken() flow (which is
    // also used by the HTTP interceptor) so only one refresh request is sent.
    toObservable(this.authService.isTokenExpired)
      .pipe(
        distinctUntilChanged(),
        filter((expired) => expired && this.authService.isLoggedIn()),
        switchMap(() =>
          this.authService.ensureFreshToken().pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.closeConnection();
        if (result) {
          // Fresh token obtained — reopen SSE with new credentials.
          this.openConnection();
        }
        // If refresh failed, the HTTP interceptor already navigates to /login.
      });
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  private openConnection(): void {
    this.closeConnection(); // clear any stale instance first

    const token = this.authService.getAccessToken();
    if (!token) return;

    // Pass the JWT as a query-param because browser EventSource cannot send
    // custom headers.  The gateway middleware accepts ?token= for this route.
    const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const es   = new EventSource(url);

    es.onopen = () => {
      this.reconnectAttempts = 0;
    };

    es.onmessage = (evt: MessageEvent) => {
      this.handleMessage(evt);
    };

    es.onerror = () => {
      this.closeConnection();
      if (this.authService.isLoggedIn()) {
        this.scheduleReconnect();
      }
    };

    this.es = es;
  }

  private closeConnection(): void {
    this.cancelReconnect();
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  // ── Message handling ───────────────────────────────────────────────────────

  private handleMessage(evt: MessageEvent): void {
    try {
      const raw    = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
      const parsed = raw as RealtimeNotification;
      this._notifications$.next(parsed);
    } catch {
      // Malformed payload — silently discard.
    }
  }

  // ── Exponential back-off reconnect ─────────────────────────────────────────

  private scheduleReconnect(): void {
    const delay = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, this.reconnectAttempts),
      BACKOFF_MAX_MS,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (this.authService.isLoggedIn()) {
        this.openConnection();
      }
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.closeConnection();
    this._notifications$.complete();
  }
}

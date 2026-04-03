import { inject } from '@angular/core';
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Routes that must not receive an Authorization header or trigger a token
 * refresh.  NOTE: /api/auth/logout is intentionally excluded — it requires a
 * valid Bearer token so the server can invalidate the refresh token.
 */
const AUTH_PASSTHROUGH_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
];

function isAuthRoute(url: string): boolean {
  return AUTH_PASSTHROUGH_PATHS.some((path) => url.includes(path));
}

function attachToken(
  req: HttpRequest<unknown>,
  token: string,
): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  // Never touch auth-flow endpoints
  if (isAuthRoute(req.url)) {
    return next(req);
  }

  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.getAccessToken();
  const outgoing = token ? attachToken(req, token) : req;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      // ── 401 — try a silent token refresh ────────────────────────────────
      // ensureFreshToken() is shared: if multiple requests get 401 at the
      // same time (e.g. two parallel calls on page init), only ONE refresh
      // HTTP request is issued and all retries receive the same new token.
      return authService.ensureFreshToken().pipe(
        catchError((refreshError: unknown) => {
          // The REFRESH itself failed — clear the token locally and redirect
          // to login.  We deliberately avoid calling authService.logout()
          // here because that would send a new HTTP request which would also
          // get a 401, creating a circular request loop.
          authService.clearToken();
          void router.navigate(['/auth', 'login']);
          return throwError(() => refreshError);
        }),
        switchMap((res) => {
          // Retry the original request with the fresh token.  Any error from
          // the retry (404, 500, …) is propagated naturally to the caller —
          // we must NOT clear the token here because the user is still
          // authenticated; only the specific downstream request failed.
          return next(attachToken(req, res.accessToken));
        }),
      );
    }),
  );
};

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

/** Routes that must not receive an Authorization header or trigger a token refresh. */
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
      return authService.refreshToken().pipe(
        switchMap((res) => {
          // Retry original request with the fresh token
          return next(attachToken(req, res.accessToken));
        }),
        catchError((refreshError: unknown) => {
          // Refresh failed — log the user out and redirect
          authService.logout().subscribe({
            complete: () => void router.navigate(['/auth', 'login']),
            error: () => void router.navigate(['/auth', 'login']),
          });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};

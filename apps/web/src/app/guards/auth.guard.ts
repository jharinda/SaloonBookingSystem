import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from '@org/shared-data-access';

/**
 * Protects routes that require authentication.
 *
 * If the in-memory access token is already present the guard passes
 * immediately (synchronous fast path).
 *
 * Otherwise it attempts a silent token refresh using the HttpOnly
 * refresh-token cookie.  This handles page refreshes and server-side
 * renders where the in-memory token has been lost but the cookie is
 * still valid.  Only if the refresh also fails does the guard redirect
 * to /auth/login.
 */
export const authGuard: CanActivateFn = (
  _route,
  state,
): boolean | UrlTree | Observable<boolean | UrlTree> => {
  const router = inject(Router);
  const authService = inject(AuthService);

  // Fast path — token already in memory
  if (authService.isLoggedIn()) return true;

  // Slow path — try to restore session from the HttpOnly cookie
  return authService.refreshToken().pipe(
    map(() => true as boolean | UrlTree),
    catchError(() =>
      of(
        router.createUrlTree(['/auth', 'login'], {
          queryParams: { returnUrl: state.url },
        }),
      ),
    ),
  );
};

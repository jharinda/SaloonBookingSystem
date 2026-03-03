import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from '@org/shared-data-access';

/**
 * Protects routes that require authentication.
 *
 * Fast path: token present AND not yet expired — pass immediately.
 *
 * Refresh path: token absent OR expired — attempt a silent token refresh
 * using the HttpOnly refresh-token cookie before proceeding.
 * Only if the refresh also fails does the guard redirect to /auth/login.
 */
export const authGuard: CanActivateFn = (
  _route,
  state,
): boolean | UrlTree | Observable<boolean | UrlTree> => {
  const router = inject(Router);
  const authService = inject(AuthService);

  // Fast path — token present and still valid
  if (authService.isLoggedIn() && !authService.isTokenExpired()) return true;

  // Slow path — no token or token expired: refresh before proceeding
  return authService.ensureFreshToken().pipe(
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

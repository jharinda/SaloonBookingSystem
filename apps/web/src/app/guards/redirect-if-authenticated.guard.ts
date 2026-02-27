import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from '@org/shared-data-access';

/**
 * Prevents authenticated users from accessing guest-only pages
 * (login / register / forgot-password).
 *
 * Fast path: if the in-memory token is present, redirect to /discover.
 * Slow path: silently try to refresh — if that succeeds the user is
 * authenticated and gets redirected; if it fails they stay on the
 * auth page.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = (): boolean | UrlTree | Observable<boolean | UrlTree> => {
  const router = inject(Router);
  const authService = inject(AuthService);

  // Fast path — already authenticated
  if (authService.isLoggedIn()) {
    return router.createUrlTree(['/discover']);
  }

  // Slow path — check if there is a valid refresh-token cookie
  return authService.refreshToken().pipe(
    map(() => router.createUrlTree(['/discover']) as boolean | UrlTree),
    catchError(() => of(true)), // no valid cookie → let them through to login
  );
};

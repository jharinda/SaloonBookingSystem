import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '@org/shared-data-access';

/**
 * Prevents authenticated users from accessing guest-only pages
 * (login / register / forgot-password).
 *
 * APP_INITIALIZER already calls initAuth() (which attempts a silent token
 * refresh) before any routing begins, so by the time this guard runs the
 * in-memory token is either set (user has a valid session) or absent (no
 * valid refresh-token cookie exists). A second refresh attempt here would
 * be redundant and causes an unnecessary 401 round-trip on every visit to
 * the auth pages.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = (): boolean | UrlTree => {
  const router = inject(Router);
  const authService = inject(AuthService);

  // If a valid in-memory token exists the user is already authenticated —
  // send them to the discover page instead of the auth route.
  if (authService.isLoggedIn()) {
    return router.createUrlTree(['/discover']);
  }

  // No token — allow access to the guest-only page.
  return true;
};

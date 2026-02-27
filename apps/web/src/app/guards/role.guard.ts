import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@org/shared-data-access';

/**
 * Protects routes that require specific roles.
 * Configure allowed roles via route data:
 *
 *   {
 *     path: 'admin',
 *     canActivate: [authGuard, roleGuard],
 *     data: { roles: ['admin'] },
 *   }
 *
 * Always pair with `authGuard` so unauthenticated users are redirected to
 * login before this guard runs. If somehow reached while unauthenticated,
 * this guard will also redirect to /auth/login.
 */
export const roleGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  const requiredRoles = (route.data['roles'] ?? []) as string[];
  const userRole = authService.currentUser()?.role;

  if (!userRole) {
    return router.createUrlTree(['/auth', 'login']);
  }

  if (requiredRoles.length === 0 || requiredRoles.includes(userRole)) {
    return true;
  }

  return router.createUrlTree(['/discover']);
};

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * Simple JWT-in-memory AuthGuard.
 * Replace `getToken()` with your real AuthService once it exists.
 */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = sessionStorage.getItem('access_token') ?? localStorage.getItem('access_token');
  if (token) return true;
  return router.createUrlTree(['/auth', 'login']);
};

/**
 * Role-based variant — checks a role claim stored alongside the token.
 * Usage: canActivate: [roleGuard('salon_owner')]
 */
export const roleGuard = (requiredRole: string): CanActivateFn => () => {
  const router = inject(Router);
  const token = sessionStorage.getItem('access_token') ?? localStorage.getItem('access_token');
  if (!token) return router.createUrlTree(['/auth', 'login']);

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload?.role === requiredRole) return true;
  } catch {
    // malformed token
  }
  return router.createUrlTree(['/discover']);
};

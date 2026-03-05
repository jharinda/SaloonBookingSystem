import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { NotificationService } from '../services/notification.service';

/** Auth-service endpoints that return 401 as part of normal flow (no session
 *  yet, token expired, etc.). We must NOT redirect to /auth/login for these
 *  because the authInterceptor or the calling code already handles them. */
const AUTH_PASSTHROUGH_PATTERNS = [
  '/api/auth/refresh',
  '/api/auth/google',
];

function isAuthPassthrough(url: string): boolean {
  return AUTH_PASSTHROUGH_PATTERNS.some((p) => url.includes(p));
}

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const router  = inject(Router);
  const notify  = inject(NotificationService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 0) {
        // Network error / no connection
        notify.error('No Connection', 'Please check your internet connection.');
      } else if (err.status === 401 && !isAuthPassthrough(req.url)) {
        localStorage.clear();
        void router.navigate(['/auth', 'login']);
      } else if (err.status === 403) {
        notify.warn('Access Denied', 'You do not have permission.');
      } else if (err.status === 404) {
        notify.info('Not Found', 'The requested resource was not found.');
      } else if (err.status >= 500) {
        notify.error('Server Error', 'Something went wrong. Please try again.');
      }

      return throwError(() => err);
    }),
  );
};

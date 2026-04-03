import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { NotificationService } from '../services/notification.service';

function serverMessageFromError(err: HttpErrorResponse): string | undefined {
  const body = err.error;
  if (body && typeof body === 'object' && body !== null && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (Array.isArray(m)) {
      return m.map(String).join(', ');
    }
    if (m != null) {
      return String(m);
    }
  }
  return undefined;
}

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const serverMessage = serverMessageFromError(err);

      if (err.status === 0) {
        // Network error / no connection
        notify.error('No Connection', 'Please check your internet connection.');
      } else if (err.status === 400) {
        notify.warn('Invalid Request', serverMessage || 'Please check your input.');
      } else if (err.status === 403) {
        notify.warn('Access Denied', serverMessage || 'You do not have permission.');
      } else if (err.status === 404) {
        notify.info('Not Found', serverMessage || 'The requested resource was not found.');
      } else if (err.status >= 500) {
        notify.error('Server Error', serverMessage || 'Something went wrong. Please try again.');
      }
      // NOTE: 401 is NOT handled here. The authInterceptor (which wraps this
      // interceptor) already handles 401 with a proper token-refresh → retry
      // flow and only redirects to /auth/login when the refresh itself fails.
      // Handling 401 here would cause a premature redirect before the
      // authInterceptor has a chance to refresh and retry the request.

      return throwError(() => err);
    }),
  );
};

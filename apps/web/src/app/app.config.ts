import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { appRoutes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { AuthService, authInterceptor } from '@org/shared-data-access';

/**
 * Silently attempts to restore the user's session from the HttpOnly
 * refresh-token cookie before any route guards run. If the cookie is absent
 * or expired the promise simply resolves and the user stays logged out.
 */
function provideAuthInit() {
  return {
    provide: APP_INITIALIZER,
    useFactory: (auth: AuthService) => () => auth.initAuth(),
    deps: [AuthService],
    multi: true,
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAuthInit(),
  ],
};

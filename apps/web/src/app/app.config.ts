import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { appRoutes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { AuthService, authInterceptor } from '@org/shared-data-access';

// Images are already stored as full Cloudinary URLs — this pass-through loader
// satisfies NgOptimizedImage and silences the missing-loader warning.
const cloudinaryPassthroughLoader = (config: ImageLoaderConfig): string =>
  config.width ? config.src.replace('/upload/', `/upload/w_${config.width}/`) : config.src;
import { httpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

// ---------------------------------------------------------------------------
// SnapSalon brand preset — Aura extended with Tailwind Emerald primary palette
// and Tailwind Zinc surface palette. Dark mode is toggled via `.app-dark`.
// ---------------------------------------------------------------------------
const SnapSalonPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50:  '#ECFDF5',
      100: '#D1FAE5',
      200: '#A7F3D0',
      300: '#6EE7B7',
      400: '#34D399',
      500: '#10B981',
      600: '#059669',
      700: '#047857',
      800: '#065F46',
      900: '#064E3B',
      950: '#022C22',
    },
    colorScheme: {
      light: {
        surface: {
          0:   '#FFFFFF',
          50:  '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          500: '#71717A',
          600: '#52525B',
          700: '#3F3F46',
          800: '#27272A',
          900: '#18181B',
          950: '#09090B',
        },
      },
      dark: {
        surface: {
          0:   '#FFFFFF',
          50:  '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          500: '#71717A',
          600: '#52525B',
          700: '#3F3F46',
          800: '#27272A',
          900: '#18181B',
          950: '#09090B',
        },
      },
    },
  },
});

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
    { provide: IMAGE_LOADER, useValue: cloudinaryPassthroughLoader },
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: SnapSalonPreset,
        options: {
          darkModeSelector: '.app-dark',
        },
      },
      ripple: true,
    }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, httpErrorInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    MessageService,
    DialogService,
    provideAuthInit(),
  ],
};

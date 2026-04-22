import {
  APP_INITIALIZER,
  ApplicationConfig,
  ErrorHandler,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import * as Sentry from '@sentry/angular';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { appRoutes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { HttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { AuthService, UserService, authInterceptor, CurrencyService, FCM_CONFIG, LanguageService } from '@org/shared-data-access';
import { environment } from '../environments/environment';

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

/**
 * After the session is restored, load the full user profile into
 * the shared UserService signal so navbar, etc. have access to
 * avatarUrl and other profile fields.
 */
function provideProfileInit() {
  return {
    provide: APP_INITIALIZER,
    useFactory: (userService: UserService) => () => userService.loadProfile(),
    deps: [UserService],
    multi: true,
  };
}

/**
 * After the session is restored, load the user's preferred currency
 * from the backend profile so every component/pipe sees the correct symbol.
 */
function provideCurrencyInit() {
  return {
    provide: APP_INITIALIZER,
    useFactory: (currency: CurrencyService) => () => currency.loadFromProfile(),
    deps: [CurrencyService],
    multi: true,
  };
}

function provideLanguageInit() {
  return {
    provide: APP_INITIALIZER,
    useFactory: (lang: LanguageService) => () => lang.init(),
    deps: [LanguageService],
    multi: true,
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler({ showDialog: false }) },
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
    importProvidersFrom(
      TranslateModule.forRoot({
        useDefaultLang: true,
        defaultLanguage: 'en',
      }),
    ),
    provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }),
    provideAuthInit(),
    provideProfileInit(),
    provideCurrencyInit(),
    provideLanguageInit(),
    // Provide FCM configuration for push notifications
    {
      provide: FCM_CONFIG,
      useValue: {
        firebaseConfig: environment.firebaseConfig,
        fcmVapidKey: environment.fcmVapidKey,
      },
    },
  ],
};

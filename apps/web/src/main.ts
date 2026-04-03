import * as Sentry from '@sentry/angular';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

if (environment.production && environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: 'production',
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

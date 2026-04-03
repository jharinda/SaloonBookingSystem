import * as Sentry from '@sentry/node';

export function initSentry(serviceName: string): void {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) {
    console.log('[Sentry] No SENTRY_DSN set, skipping initialization');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] || 'development',
    release: process.env['GIT_SHA'] || 'unknown',
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
    // Don't send in development
    enabled: process.env['NODE_ENV'] !== 'development',
  });
  Sentry.getGlobalScope().setTag('service', serviceName);
}

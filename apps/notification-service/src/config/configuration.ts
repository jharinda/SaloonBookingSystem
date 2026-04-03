/**
 * Notification-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port: parseInt(process.env['NOTIFICATION_PORT'] ?? '3004', 10),
    env: process.env['NODE_ENV'] ?? 'development',
  },
  services: {
    authUrl:    process.env['AUTH_SERVICE_URL']    ?? 'http://localhost:3003',
    salonUrl:   process.env['SALON_SERVICE_URL']   ?? 'http://localhost:3001',
  },
  gatewayUrl:    process.env['GATEWAY_URL']        ?? 'http://localhost:3000',
  internalToken: process.env['INTERNAL_TOKEN'],
  db: {
    uri: process.env['NOTIFICATION_MONGODB_URI'],
  },
  redis: {
    host:       process.env['REDIS_HOST'] ?? 'localhost',
    port:       parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    password:   process.env['REDIS_PASSWORD']?.trim() || undefined,
    tlsEnabled: process.env['REDIS_TLS'] === 'true',
  },
  email: {
    sendgridApiKey: process.env['SENDGRID_API_KEY'],
    from:           process.env['EMAIL_FROM']      ?? 'noreply@snapsalon.lk',
    fromName:       process.env['EMAIL_FROM_NAME'] ?? 'SnapSalon',
  },
  frontendUrl: process.env['FRONTEND_URL'] ?? 'https://snapsalon.lk',
  firebase: {
    /** JSON string of the Firebase service-account credentials */
    serviceAccount: process.env['FIREBASE_SERVICE_ACCOUNT_JSON'],
  },
});

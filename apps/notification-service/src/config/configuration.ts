/**
 * Notification-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    env: process.env['NODE_ENV'] ?? 'development',
  },
  db: {
    uri: process.env['MONGODB_URI'],
  },
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  },
  email: {
    from:     process.env['EMAIL_FROM']     ?? 'noreply@snapsalon.lk',
    smtpHost: process.env['SMTP_HOST']      ?? 'localhost',
    smtpPort: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    smtpUser: process.env['SMTP_USER'],
    smtpPass: process.env['SMTP_PASS'],
  },
  firebase: {
    /** JSON string of the Firebase service-account credentials */
    serviceAccount: process.env['FIREBASE_SERVICE_ACCOUNT_JSON'],
  },
});

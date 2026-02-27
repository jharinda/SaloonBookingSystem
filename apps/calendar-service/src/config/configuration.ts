/**
 * Calendar-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port:        parseInt(process.env['CALENDAR_PORT'] ?? '3005', 10),
    env:         process.env['NODE_ENV']      ?? 'development',
    frontendUrl: process.env['FRONTEND_URL']  ?? 'http://localhost:4200',
    emailFrom:   process.env['EMAIL_FROM']    ?? 'noreply@snapsalon.lk',
  },
  db: {
    uri: process.env['MONGODB_URI'],
  },
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  },
});

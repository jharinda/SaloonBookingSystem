/**
 * API-gateway typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port:       parseInt(process.env['PORT'] ?? '3000', 10),
    env:        process.env['NODE_ENV']      ?? 'development',
    corsOrigin: process.env['CORS_ORIGIN']   ?? 'http://localhost:4200',
  },
  jwt: {
    secret: process.env['JWT_ACCESS_SECRET'],
  },
  services: {
    authUrl:         process.env['AUTH_SERVICE_URL']         ?? 'http://localhost:3003',
    salonUrl:        process.env['SALON_SERVICE_URL']        ?? 'http://localhost:3001',
    bookingUrl:      process.env['BOOKING_SERVICE_URL']      ?? 'http://localhost:3002',
    reviewUrl:       process.env['REVIEW_SERVICE_URL']       ?? 'http://localhost:3006',
    calendarUrl:     process.env['CALENDAR_SERVICE_URL']     ?? 'http://localhost:3005',
    subscriptionUrl: process.env['SUBSCRIPTION_SERVICE_URL'] ?? 'http://localhost:3007',
  },
});

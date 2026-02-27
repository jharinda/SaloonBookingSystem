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
    secret: process.env['JWT_SECRET'],
  },
  services: {
    authUrl:         process.env['AUTH_SERVICE_URL'],
    salonUrl:        process.env['SALON_SERVICE_URL'],
    bookingUrl:      process.env['BOOKING_SERVICE_URL'],
    reviewUrl:       process.env['REVIEW_SERVICE_URL'],
    calendarUrl:     process.env['CALENDAR_SERVICE_URL'],
    subscriptionUrl: process.env['SUBSCRIPTION_SERVICE_URL'],
  },
});

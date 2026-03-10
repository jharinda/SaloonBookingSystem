/**
 * Booking-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port: parseInt(process.env['BOOKING_PORT'] ?? '3002', 10),
    env:  process.env['NODE_ENV'] ?? 'development',
  },
  db: {
    uri: process.env['BOOKING_MONGODB_URI'],
  },
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  },
  jwt: {
    accessSecret: process.env['JWT_ACCESS_SECRET'],
  },
  services: {
    authUrl:         process.env['AUTH_SERVICE_URL']          ?? 'http://localhost:3003',
    salonUrl:        process.env['SALON_SERVICE_URL']        ?? 'http://localhost:3001',
    notificationUrl: process.env['NOTIFICATION_SERVICE_URL'] ?? 'http://localhost:3004',
    calendarUrl:     process.env['CALENDAR_SERVICE_URL']     ?? 'http://localhost:3005',
    apiGatewayUrl:   process.env['API_GATEWAY_URL']          ?? 'http://localhost:3000',
  },
  internalToken: process.env['INTERNAL_TOKEN'],
});

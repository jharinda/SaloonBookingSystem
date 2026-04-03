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
    /** Read-only access to booking-service `bookings` collection (iCal, OAuth flows). */
    bookingUri:
      process.env['BOOKING_MONGODB_URI'] ??
      'mongodb://localhost:27017/snapsalon-booking',
    /** Google OAuth tokens and calendar-specific data only. */
    calendarUri:
      process.env['CALENDAR_MONGODB_URI'] ||
      process.env['MONGODB_URI'] ||
      process.env['MONGO_URI'] ||
      'mongodb://localhost:27017/snapsalon-calendar',
  },
  redis: {
    host:       process.env['REDIS_HOST'] ?? 'localhost',
    port:       parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    password:   process.env['REDIS_PASSWORD']?.trim() || undefined,
    tlsEnabled: process.env['REDIS_TLS'] === 'true',
  },
});

import * as Joi from 'joi';

/**
 * Joi validation schema for calendar-service environment variables.
 */
export const validationSchema = Joi.object({
  CALENDAR_PORT: Joi.number().integer().default(3005),
  NODE_ENV:      Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  SENTRY_DSN:    Joi.string().uri().optional(),
  FRONTEND_URL:  Joi.string().uri().default('http://localhost:4200'),
  EMAIL_FROM:    Joi.string().email().default('noreply@snapsalon.lk'),

  // Booking DB — read-only `bookings` collection (same data as booking-service)
  BOOKING_MONGODB_URI: Joi.string().default('mongodb://localhost:27017/snapsalon-booking'),
  // Calendar DB — Google OAuth tokens only
  CALENDAR_MONGODB_URI: Joi.string().default('mongodb://localhost:27017/snapsalon-calendar'),
  MONGODB_URI: Joi.string().optional(),

  // Redis (Bull queues)
  REDIS_HOST:     Joi.string().default('localhost'),
  REDIS_PORT:     Joi.number().integer().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS:      Joi.string().optional().valid('true', 'false').default('false'),
});

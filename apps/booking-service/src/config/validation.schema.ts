import * as Joi from 'joi';

/**
 * Joi validation schema for booking-service environment variables.
 */
export const validationSchema = Joi.object({
  BOOKING_PORT: Joi.number().integer().default(3002),
  NODE_ENV:     Joi.string().valid('development', 'production', 'test').default('development'),

  // MongoDB
  BOOKING_MONGODB_URI: Joi.string().required().messages({
    'any.required': 'BOOKING_MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-bookings)',
  }),

  // Redis (used for Bull queues and slot-availability caching)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET is required and must be at least 32 characters',
    'string.min':   'JWT_ACCESS_SECRET must be at least 32 characters',
  }),

  // Upstream services
  SALON_SERVICE_URL: Joi.string().uri().default('http://salon-service:3001').messages({
    'string.uri': 'SALON_SERVICE_URL must be a valid URL',
  }),
});

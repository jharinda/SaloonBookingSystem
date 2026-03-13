import * as Joi from 'joi';

/**
 * Joi validation schema for calendar-service environment variables.
 */
export const validationSchema = Joi.object({
  CALENDAR_PORT: Joi.number().integer().default(3005),
  NODE_ENV:      Joi.string().valid('development', 'production', 'test').default('development'),
  FRONTEND_URL:  Joi.string().uri().default('http://localhost:4200'),
  EMAIL_FROM:    Joi.string().email().default('noreply@snapsalon.lk'),

  // MongoDB — calendar-service reads from the booking database for iCal generation
  CALENDAR_MONGODB_URI: Joi.string().default('mongodb://localhost:27017/snapsalon-booking'),
  MONGODB_URI: Joi.string().optional(),

  // Redis (Bull queues)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),
});

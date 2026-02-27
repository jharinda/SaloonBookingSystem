import * as Joi from 'joi';

/**
 * Joi validation schema for calendar-service environment variables.
 */
export const validationSchema = Joi.object({
  CALENDAR_PORT: Joi.number().integer().default(3005),
  NODE_ENV:      Joi.string().valid('development', 'production', 'test').default('development'),
  FRONTEND_URL:  Joi.string().uri().default('http://localhost:4200'),
  EMAIL_FROM:    Joi.string().email().default('noreply@snapsalon.lk'),

  // MongoDB
  MONGODB_URI: Joi.string().required().messages({
    'any.required': 'MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-calendar)',
  }),

  // Redis (Bull queues)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),
});

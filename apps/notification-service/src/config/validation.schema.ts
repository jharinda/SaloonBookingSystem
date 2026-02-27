import * as Joi from 'joi';

/**
 * Joi validation schema for notification-service environment variables.
 * This service is a headless Bull queue consumer with no HTTP port.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // MongoDB
  MONGODB_URI: Joi.string().required().messages({
    'any.required': 'MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-notifications)',
  }),

  // Redis — required for Bull queue consumption
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),

  // Email (optional — service degrades gracefully without SMTP)
  EMAIL_FROM: Joi.string().email().default('noreply@snapsalon.lk'),
  SMTP_HOST:  Joi.string().default('localhost'),
  SMTP_PORT:  Joi.number().integer().default(587),
  SMTP_USER:  Joi.string().optional(),
  SMTP_PASS:  Joi.string().optional(),
});

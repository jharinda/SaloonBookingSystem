import * as Joi from 'joi';

/**
 * Joi validation schema for notification-service environment variables.
 * This service is a headless Bull queue consumer with no HTTP port.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // MongoDB
  MONGODB_URI: Joi.string().default('mongodb://localhost:27017/snapsalon-notifications'),

  // Redis — required for Bull queue consumption
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),

  // Internal service-to-service token (must match INTERNAL_TOKEN in API gateway)
  INTERNAL_TOKEN: Joi.string().default(''),

  // Gateway URL for SSE push
  GATEWAY_URL: Joi.string().uri().default('http://localhost:3000'),

  // Email (optional — service degrades gracefully without SMTP)
  EMAIL_FROM: Joi.string().email().default('noreply@snapsalon.lk'),
  SMTP_HOST:  Joi.string().default('localhost'),
  SMTP_PORT:  Joi.number().integer().default(587),
  SMTP_USER:  Joi.string().optional(),
  SMTP_PASS:  Joi.string().optional(),
});

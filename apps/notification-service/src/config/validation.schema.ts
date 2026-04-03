import * as Joi from 'joi';

/**
 * Joi validation schema for notification-service environment variables.
 * This service is a headless Bull queue consumer with no HTTP port.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  SENTRY_DSN: Joi.string().uri().optional(),

  // MongoDB
  NOTIFICATION_MONGODB_URI: Joi.string().default('mongodb://localhost:27017/snapsalon-notifications'),

  // Redis — required for Bull queue consumption
  REDIS_HOST:     Joi.string().default('localhost'),
  REDIS_PORT:     Joi.number().integer().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS:      Joi.string().optional().valid('true', 'false').default('false'),

  // Internal service-to-service token (must match INTERNAL_TOKEN in API gateway)
  INTERNAL_TOKEN: Joi.string().default(''),

  // Gateway URL for SSE push
  GATEWAY_URL: Joi.string().uri().default('http://localhost:3000'),

  // Email — SendGrid (optional; service degrades gracefully without it)
  SENDGRID_API_KEY: Joi.string().optional(),
  EMAIL_FROM:       Joi.string().email().default('noreply@snapsalon.lk'),
  EMAIL_FROM_NAME:  Joi.string().default('SnapSalon'),
  // Set to 'false' to disable all outgoing emails (e.g. to stay within SendGrid daily limits)
  EMAIL_ENABLED:    Joi.string().valid('true', 'false').default('true'),

  // Frontend URL — used in review-request email links
  FRONTEND_URL: Joi.string().uri().default('https://snapsalon.lk'),

  // SMS — Dialog Axiata (optional; service degrades gracefully without it)
  DIALOG_SMS_API_KEY:  Joi.string().optional(),
  DIALOG_SMS_BASE_URL: Joi.string().uri().optional(),
  SMS_SENDER_ID:       Joi.string().default('SnapSalon'),
});

import * as Joi from 'joi';

/**
 * Joi validation schema for api-gateway environment variables.
 */
export const validationSchema = Joi.object({
  PORT:       Joi.number().integer().default(3000),
  NODE_ENV:   Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  SENTRY_DSN: Joi.string().uri().optional(),
  CORS_ORIGIN: Joi.string().default('http://localhost:4200'),

  // JWT — used to verify incoming Bearer tokens before proxying
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET must be set in environment variables',
    'string.min':   'JWT_ACCESS_SECRET must be at least 32 characters',
  }),

  // Internal service-to-service token for the /notifications/push endpoint
  INTERNAL_TOKEN: Joi.string().default(''),

  // Upstream service URLs — optional with localhost defaults for local development
  AUTH_SERVICE_URL:         Joi.string().uri().default('http://localhost:3003'),
  USER_SERVICE_URL:         Joi.string().uri().default('http://localhost:3008'),
  SALON_SERVICE_URL:        Joi.string().uri().default('http://localhost:3001'),
  BOOKING_SERVICE_URL:      Joi.string().uri().default('http://localhost:3002'),
  REVIEW_SERVICE_URL:       Joi.string().uri().default('http://localhost:3006'),
  CALENDAR_SERVICE_URL:     Joi.string().uri().default('http://localhost:3005'),
  SUBSCRIPTION_SERVICE_URL: Joi.string().uri().default('http://localhost:3007'),
  NOTIFICATION_SERVICE_URL: Joi.string().uri().default('http://localhost:3004'),
  CHAT_SERVICE_URL:         Joi.string().uri().default('http://localhost:3009'),

  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS:      Joi.string().optional().valid('true', 'false').default('false'),
});

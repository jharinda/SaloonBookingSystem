import * as Joi from 'joi';

/**
 * Joi validation schema for subscription-service environment variables.
 */
export const validationSchema = Joi.object({
  SUBSCRIPTION_PORT: Joi.number().integer().default(3007),
  NODE_ENV:          Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  SENTRY_DSN:        Joi.string().uri().optional(),

  // MongoDB
  SUBSCRIPTION_MONGODB_URI: Joi.string().required().messages({
    'any.required': 'SUBSCRIPTION_MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-subscriptions)',
  }),

  // JWT (shared secret so JwtStrategy can verify tokens)
  JWT_ACCESS_SECRET: Joi.string().required(),

  // PayHere payment gateway (optional for local development)
  PAYHERE_MERCHANT_ID: Joi.string().default(''),
  // Set to real value in production — webhooks will be rejected without a valid secret
  PAYHERE_SECRET:      Joi.string().default(''),
  PAYHERE_RETURN_URL:  Joi.string().uri().optional(),
  PAYHERE_CANCEL_URL:  Joi.string().uri().optional(),
  PAYHERE_NOTIFY_URL:  Joi.string().uri().optional(),

  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS:      Joi.string().optional().valid('true', 'false').default('false'),
});

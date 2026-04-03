import * as Joi from 'joi';

/**
 * Joi validation schema for user-service environment variables.
 */
export const validationSchema = Joi.object({
  USER_PORT: Joi.number().integer().default(3008),
  NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  SENTRY_DSN: Joi.string().uri().optional(),

  // MongoDB
  USER_MONGODB_URI: Joi.string().required().messages({
    'any.required': 'USER_MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-users)',
  }),

  // JWT (shared secret so JwtStrategy can verify tokens)
  JWT_ACCESS_SECRET: Joi.string().required(),

  // Cloudinary — optional; avatar uploads are disabled without these
  CLOUDINARY_CLOUD_NAME: Joi.string().optional().default(''),
  CLOUDINARY_API_KEY:    Joi.string().optional().default(''),
  CLOUDINARY_API_SECRET: Joi.string().optional().default(''),

  // Redis for Bull queues
  REDIS_HOST:     Joi.string().default('localhost'),
  REDIS_PORT:     Joi.number().integer().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS:      Joi.string().optional().valid('true', 'false').default('false'),

  // Inter-service calls to auth-service (e.g. connected accounts)
  AUTH_SERVICE_URL: Joi.string().uri().default('http://localhost:3003'),
  INTERNAL_TOKEN: Joi.string().optional().allow('').default(''),
});

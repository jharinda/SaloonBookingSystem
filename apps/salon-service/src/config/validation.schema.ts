import * as Joi from 'joi';

/**
 * Joi validation schema for salon-service environment variables.
 */
export const validationSchema = Joi.object({
  SALON_PORT: Joi.number().integer().default(3001),
  NODE_ENV:   Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  SENTRY_DSN: Joi.string().uri().optional(),

  // MongoDB
  SALON_MONGODB_URI: Joi.string().required().messages({
    'any.required': 'SALON_MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-salon)',
  }),

  // JWT (access secret shared across services for token verification)
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET is required and must be at least 32 characters',
    'string.min':   'JWT_ACCESS_SECRET must be at least 32 characters',
  }),

  // Cloudinary image uploads — API secret required; service cannot sign uploads without it
  CLOUDINARY_CLOUD_NAME: Joi.string().default(''),
  CLOUDINARY_API_KEY:    Joi.string().default(''),
  CLOUDINARY_API_SECRET: Joi.string().required().messages({
    'any.required': 'CLOUDINARY_API_SECRET must be set in environment variables',
    'string.empty': 'CLOUDINARY_API_SECRET must not be empty',
  }),

  // Redis (slot / cache)
  REDIS_HOST:     Joi.string().default('localhost'),
  REDIS_PORT:     Joi.number().integer().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS:      Joi.string().optional().valid('true', 'false').default('false'),
});

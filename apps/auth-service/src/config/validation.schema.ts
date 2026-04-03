import * as Joi from 'joi';

/**
 * Joi validation schema for auth-service environment variables.
 * The app will refuse to start and print descriptive errors for any violation.
 */
export const validationSchema = Joi.object({
  AUTH_PORT:    Joi.number().integer().default(3003),
  NODE_ENV:     Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  SENTRY_DSN:   Joi.string().uri().optional(),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:4200'),

  // MongoDB
  MONGODB_URI: Joi.string().required().messages({
    'any.required': 'MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-auth)',
    'string.empty': 'MONGODB_URI must not be empty',
  }),

  // JWT — both secrets must be at least 32 characters for HS256 security
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET is required and must be at least 32 characters',
    'string.min':   'JWT_ACCESS_SECRET must be at least 32 characters',
  }),
  JWT_REFRESH_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_REFRESH_SECRET is required and must be at least 32 characters',
    'string.min':   'JWT_REFRESH_SECRET must be at least 32 characters',
  }),
  JWT_ACCESS_EXPIRES_IN:  Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Cloudinary — optional; avatar uploads are disabled without these
  CLOUDINARY_CLOUD_NAME: Joi.string().optional().default(''),
  CLOUDINARY_API_KEY:    Joi.string().optional().default(''),
  CLOUDINARY_API_SECRET: Joi.string().optional().default(''),

  // Google OAuth — optional; service starts without them but /auth/google routes will be disabled
  AUTH_GOOGLE_CLIENT_ID: Joi.string().optional().default('').messages({
    'string.empty': 'AUTH_GOOGLE_CLIENT_ID not set — Google OAuth login will be disabled',
  }),
  AUTH_GOOGLE_CLIENT_SECRET: Joi.string().optional().default('').messages({
    'string.empty': 'AUTH_GOOGLE_CLIENT_SECRET not set — Google OAuth login will be disabled',
  }),
  AUTH_GOOGLE_CALLBACK_URL: Joi.string().uri()
    .default('http://localhost:3003/api/auth/google/callback'),

  // Redis — required for OTP storage and Bull queue
  REDIS_HOST:     Joi.string().default('localhost'),
  REDIS_PORT:     Joi.number().integer().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS:      Joi.string().optional().valid('true', 'false').default('false'),
});

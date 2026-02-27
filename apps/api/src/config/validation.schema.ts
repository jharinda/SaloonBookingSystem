import * as Joi from 'joi';

/**
 * Joi validation schema for api-gateway environment variables.
 */
export const validationSchema = Joi.object({
  PORT:       Joi.number().integer().default(3000),
  NODE_ENV:   Joi.string().valid('development', 'production', 'test').default('development'),
  CORS_ORIGIN: Joi.string().default('http://localhost:4200'),

  // JWT — used to verify incoming Bearer tokens before proxying
  JWT_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_SECRET is required and must be at least 32 characters',
    'string.min':   'JWT_SECRET must be at least 32 characters',
  }),

  // Upstream service URLs — all required so the gateway knows where to route
  AUTH_SERVICE_URL: Joi.string().uri().required().messages({
    'any.required': 'AUTH_SERVICE_URL is required (e.g. http://auth-service:3003)',
  }),
  SALON_SERVICE_URL: Joi.string().uri().required().messages({
    'any.required': 'SALON_SERVICE_URL is required (e.g. http://salon-service:3001)',
  }),
  BOOKING_SERVICE_URL: Joi.string().uri().required().messages({
    'any.required': 'BOOKING_SERVICE_URL is required (e.g. http://booking-service:3002)',
  }),
  REVIEW_SERVICE_URL: Joi.string().uri().required().messages({
    'any.required': 'REVIEW_SERVICE_URL is required (e.g. http://review-service:3006)',
  }),
  CALENDAR_SERVICE_URL: Joi.string().uri().required().messages({
    'any.required': 'CALENDAR_SERVICE_URL is required (e.g. http://calendar-service:3005)',
  }),
  SUBSCRIPTION_SERVICE_URL: Joi.string().uri().required().messages({
    'any.required': 'SUBSCRIPTION_SERVICE_URL is required (e.g. http://subscription-service:3007)',
  }),
});

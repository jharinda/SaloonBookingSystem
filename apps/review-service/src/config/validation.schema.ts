import * as Joi from 'joi';

/**
 * Joi validation schema for review-service environment variables.
 */
export const validationSchema = Joi.object({
  REVIEW_PORT: Joi.number().integer().default(3006),
  NODE_ENV:    Joi.string().valid('development', 'production', 'test').default('development'),

  // MongoDB
  REVIEW_MONGODB_URI: Joi.string().required().messages({
    'any.required': 'REVIEW_MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-reviews)',
  }),

  // Inter-service URLs
  BOOKING_SERVICE_URL: Joi.string().uri().default('http://localhost:3002'),
  SALON_SERVICE_URL:   Joi.string().uri().default('http://localhost:3001'),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET is required and must be at least 32 characters',
    'string.min':   'JWT_ACCESS_SECRET must be at least 32 characters',
  }),

  // Cloudinary (shared with salon-service, optional for local dev)
  CLOUDINARY_CLOUD_NAME: Joi.string().default(''),
  CLOUDINARY_API_KEY:    Joi.string().default(''),
  CLOUDINARY_API_SECRET: Joi.string().default(''),
});

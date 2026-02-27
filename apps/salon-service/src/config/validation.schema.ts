import * as Joi from 'joi';

/**
 * Joi validation schema for salon-service environment variables.
 */
export const validationSchema = Joi.object({
  SALON_PORT: Joi.number().integer().default(3001),
  NODE_ENV:   Joi.string().valid('development', 'production', 'test').default('development'),

  // MongoDB
  SALON_MONGODB_URI: Joi.string().required().messages({
    'any.required': 'SALON_MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-salons)',
  }),

  // JWT (access secret shared across services for token verification)
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET is required and must be at least 32 characters',
    'string.min':   'JWT_ACCESS_SECRET must be at least 32 characters',
  }),

  // Cloudinary image uploads
  CLOUDINARY_CLOUD_NAME: Joi.string().required().messages({
    'any.required': 'CLOUDINARY_CLOUD_NAME is required for image uploads',
  }),
  CLOUDINARY_API_KEY: Joi.string().required().messages({
    'any.required': 'CLOUDINARY_API_KEY is required for image uploads',
  }),
  CLOUDINARY_API_SECRET: Joi.string().required().messages({
    'any.required': 'CLOUDINARY_API_SECRET is required for image uploads',
  }),
});

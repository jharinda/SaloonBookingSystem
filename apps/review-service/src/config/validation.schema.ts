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

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET is required and must be at least 32 characters',
    'string.min':   'JWT_ACCESS_SECRET must be at least 32 characters',
  }),
});

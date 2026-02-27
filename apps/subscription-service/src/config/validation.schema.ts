import * as Joi from 'joi';

/**
 * Joi validation schema for subscription-service environment variables.
 */
export const validationSchema = Joi.object({
  SUBSCRIPTION_PORT: Joi.number().integer().default(3007),
  NODE_ENV:          Joi.string().valid('development', 'production', 'test').default('development'),

  // MongoDB
  SUBSCRIPTION_MONGODB_URI: Joi.string().required().messages({
    'any.required': 'SUBSCRIPTION_MONGODB_URI is required (e.g. mongodb://localhost:27017/snapsalon-subscriptions)',
  }),
});

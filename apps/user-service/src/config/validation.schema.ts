import * as Joi from 'joi';

/**
 * Joi validation schema for user-service environment variables.
 */
export const validationSchema = Joi.object({
  USER_PORT: Joi.number().integer().default(3002),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // MongoDB
  USER_MONGODB_URI: Joi.string().required().messages({
    'any.required': 'USER_MONGODB_URI is required (e.g. mongodb://localhost:27017/user-db)',
  }),

  // JWT (shared secret so JwtStrategy can verify tokens)
  JWT_ACCESS_SECRET: Joi.string().required(),

  // Redis for Bull queues
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),
});

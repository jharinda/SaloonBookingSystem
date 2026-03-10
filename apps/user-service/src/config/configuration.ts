/**
 * User-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port: parseInt(process.env['USER_PORT'] ?? '3002', 10),
    env: process.env['NODE_ENV'] ?? 'development',
  },
  db: {
    uri: process.env['USER_MONGODB_URI'] ?? 'mongodb://localhost:27017/user-db',
  },
  jwt: {
    accessSecret: process.env['JWT_ACCESS_SECRET'],
  },
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  },
});

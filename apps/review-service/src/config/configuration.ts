/**
 * Review-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port: parseInt(process.env['REVIEW_PORT'] ?? '3006', 10),
    env:  process.env['NODE_ENV'] ?? 'development',
  },
  db: {
    uri: process.env['REVIEW_MONGODB_URI'],
  },
  jwt: {
    accessSecret: process.env['JWT_ACCESS_SECRET'],
  },
});

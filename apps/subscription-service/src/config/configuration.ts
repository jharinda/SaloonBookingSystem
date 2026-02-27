/**
 * Subscription-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port: parseInt(process.env['SUBSCRIPTION_PORT'] ?? '3007', 10),
    env:  process.env['NODE_ENV'] ?? 'development',
  },
  db: {
    uri: process.env['SUBSCRIPTION_MONGODB_URI'],
  },
});

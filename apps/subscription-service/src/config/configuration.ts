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
  jwt: {
    accessSecret: process.env['JWT_ACCESS_SECRET'],
  },
  payhere: {
    merchantId: process.env['PAYHERE_MERCHANT_ID'],
    secret:     process.env['PAYHERE_SECRET'],
    returnUrl:  process.env['PAYHERE_RETURN_URL'] ?? 'http://localhost:4200/subscription/success',
    cancelUrl:  process.env['PAYHERE_CANCEL_URL'] ?? 'http://localhost:4200/subscription/cancel',
    notifyUrl:  process.env['PAYHERE_NOTIFY_URL']  ?? 'http://localhost:3007/api/subscriptions/webhook',
  },
});

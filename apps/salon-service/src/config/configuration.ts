/**
 * Salon-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port: parseInt(process.env['SALON_PORT'] ?? '3001', 10),
    env:  process.env['NODE_ENV'] ?? 'development',
  },
  db: {
    uri: process.env['SALON_MONGODB_URI'],
  },
  jwt: {
    accessSecret: process.env['JWT_ACCESS_SECRET'],
  },
  cloudinary: {
    cloudName: process.env['CLOUDINARY_CLOUD_NAME'],
    apiKey:    process.env['CLOUDINARY_API_KEY'],
    apiSecret: process.env['CLOUDINARY_API_SECRET'],
  },
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  },
  services: {
    authUrl: process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3003',
    bookingUrl: process.env['BOOKING_SERVICE_URL'] ?? 'http://localhost:3002',
    reviewUrl: process.env['REVIEW_SERVICE_URL'] ?? 'http://localhost:3005',
  },
  internalToken: process.env['INTERNAL_SERVICE_TOKEN'] ?? '',
});

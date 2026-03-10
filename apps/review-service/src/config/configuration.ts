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
  services: {
    bookingUrl:      process.env['BOOKING_SERVICE_URL']      ?? 'http://localhost:3002',
    salonUrl:        process.env['SALON_SERVICE_URL']        ?? 'http://localhost:3001',
    notificationUrl: process.env['NOTIFICATION_SERVICE_URL'] ?? 'http://localhost:3004',
  },
  cloudinary: {
    cloudName: process.env['CLOUDINARY_CLOUD_NAME'],
    apiKey:    process.env['CLOUDINARY_API_KEY'],
    apiSecret: process.env['CLOUDINARY_API_SECRET'],
  },
});

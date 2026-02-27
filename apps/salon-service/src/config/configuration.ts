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
});

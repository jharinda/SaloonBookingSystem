/**
 * User-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 */
export default () => ({
  app: {
    port: parseInt(process.env['USER_PORT'] ?? '3008', 10),
    env: process.env['NODE_ENV'] ?? 'development',
  },
  db: {
    uri: process.env['USER_MONGODB_URI'] ?? 'mongodb://localhost:27017/snapsalon-users',
  },
  jwt: {
    accessSecret: process.env['JWT_ACCESS_SECRET'],
  },
  cloudinary: {
    cloudName: process.env['CLOUDINARY_CLOUD_NAME'] ?? '',
    apiKey:    process.env['CLOUDINARY_API_KEY']    ?? '',
    apiSecret: process.env['CLOUDINARY_API_SECRET'] ?? '',
  },
  redis: {
    host:       process.env['REDIS_HOST'] ?? 'localhost',
    port:       parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    password:   process.env['REDIS_PASSWORD']?.trim() || undefined,
    tlsEnabled: process.env['REDIS_TLS'] === 'true',
  },
  services: {
    authUrl: process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3003',
  },
  internalToken: process.env['INTERNAL_TOKEN'] ?? '',
});

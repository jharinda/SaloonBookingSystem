/**
 * Auth-service typed configuration factory.
 * This is the ONLY place that may read process.env directly.
 * All other code must inject ConfigService and use dot-notation paths.
 */
export default () => ({
  app: {
    port:        parseInt(process.env['AUTH_PORT'] ?? '3003', 10),
    env:         process.env['NODE_ENV'] ?? 'development',
    frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:4200',
  },
  db: {
    uri: process.env['MONGODB_URI'],
  },
  jwt: {
    accessSecret:     process.env['JWT_ACCESS_SECRET'],
    refreshSecret:    process.env['JWT_REFRESH_SECRET'],
    accessExpiresIn:  process.env['JWT_ACCESS_EXPIRES_IN']  ?? '15m',
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d',
  },
  google: {
    clientId:    process.env['AUTH_GOOGLE_CLIENT_ID'],
    clientSecret: process.env['AUTH_GOOGLE_CLIENT_SECRET'],
    callbackUrl: process.env['AUTH_GOOGLE_CALLBACK_URL'] ??
                   'http://localhost:3003/api/auth/google/callback',
  },
});

// Module
export { SharedAuthModule, SharedAuthModuleOptions } from './lib/shared-auth.module';

// Logging
export { createLoggerConfig } from './lib/logging/logger.config';

// Health
export { HealthModule } from './lib/health/health.module';
export { RedisHealthIndicator } from './lib/health/redis-health.indicator';
export { RedisClientModule } from './lib/redis-client.module';

// Guards
export { JwtAuthGuard } from './lib/guards/jwt-auth.guard';
export { RolesGuard } from './lib/guards/roles.guard';

// Decorators
export { Roles, ROLES_KEY } from './lib/decorators/roles.decorator';
export { CurrentUser, JwtUser } from './lib/decorators/current-user.decorator';
export { Public, IS_PUBLIC_KEY } from './lib/decorators/public.decorator';

// Strategy
export { JwtStrategy, JwtPayload } from './lib/strategies/jwt.strategy';

// Middleware
export { CorrelationLoggingMiddleware, CORRELATION_ID_HEADER } from './lib/middleware/correlation-logging.middleware';

// Utilities
export { httpRetryWithBackoff, fireAndForget } from './lib/utils/http-resilience.util';
export {
  createRedisProvider,
  getBullRedisConnection,
  getRedisConnectionOptions,
  REDIS_CLIENT,
} from './lib/utils/redis.provider';

// Enums
export { UserRole } from './lib/enums/user-role.enum';

// Exception filters
export { GlobalExceptionFilter } from './lib/filters/http-exception.filter';

// Sentry
export { initSentry } from './lib/sentry/sentry.init';

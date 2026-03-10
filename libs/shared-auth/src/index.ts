// Module
export { SharedAuthModule, SharedAuthModuleOptions } from './lib/shared-auth.module';

// Guards
export { JwtAuthGuard } from './lib/guards/jwt-auth.guard';
export { RolesGuard } from './lib/guards/roles.guard';

// Decorators
export { Roles, ROLES_KEY } from './lib/decorators/roles.decorator';
export { CurrentUser, JwtUser } from './lib/decorators/current-user.decorator';

// Strategy
export { JwtStrategy, JwtPayload } from './lib/strategies/jwt.strategy';

// Middleware
export { CorrelationLoggingMiddleware, CORRELATION_ID_HEADER } from './lib/middleware/correlation-logging.middleware';

// Utilities
export { httpRetryWithBackoff, fireAndForget } from './lib/utils/http-resilience.util';

// Enums
export { UserRole } from './lib/enums/user-role.enum';

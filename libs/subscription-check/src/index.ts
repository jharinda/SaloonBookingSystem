// Module
export { SubscriptionCheckModule, SubscriptionCheckModuleOptions } from './lib/subscription-check.module';

// Service
export { SubscriptionCheckService } from './lib/subscription-check.service';

// Guards
export { SubscriptionGuard } from './lib/guards/subscription.guard';

// Decorators
export { RequiresFeature, REQUIRES_FEATURE_KEY } from './lib/decorators/requires-feature.decorator';
export { CheckLimit, CHECK_LIMIT_KEY } from './lib/decorators/check-limit.decorator';

// Interfaces
export { FeatureCheckResponse, LimitType } from './lib/interfaces/subscription-check.interface';

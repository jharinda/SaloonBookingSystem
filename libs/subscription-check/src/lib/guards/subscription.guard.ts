import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionCheckService } from '../subscription-check.service';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionCheckService: SubscriptionCheckService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.get<string>(
      REQUIRES_FEATURE_KEY,
      context.getHandler(),
    );

    if (!feature) {
      // No feature requirement, allow access
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Resolve salonId from multiple sources (in priority order):
    // 1. JWT payload (if auth-service ever starts including it)
    // 2. x-salon-id header (set by API gateway when present in JWT)
    // 3. salonId query parameter (e.g. client-initiated calendar actions)
    const salonId =
      user?.salonId ||
      request.headers?.['x-salon-id'] ||
      request.query?.['salonId'] ||
      null;

    if (!salonId) {
      this.logger.warn('No salonId found in JWT payload, headers, or query params');
      throw new ForbiddenException(
        'Unable to verify subscription: salonId not found in token',
      );
    }

    const result = await this.subscriptionCheckService.getFeatureCheckDetails(
      salonId,
      feature,
    );

    if (!result.allowed) {
      this.logger.warn(
        `Feature '${feature}' denied for salon ${salonId}: ${result.reason}`,
      );
      throw new ForbiddenException(
        result.reason ??
          `Your subscription plan does not include this feature. Please upgrade.`,
      );
    }

    this.logger.debug(`Feature '${feature}' allowed for salon ${salonId}`);
    return true;
  }
}

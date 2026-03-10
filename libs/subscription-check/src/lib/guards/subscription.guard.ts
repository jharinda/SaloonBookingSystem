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

    if (!user || !user.salonId) {
      this.logger.warn('No salonId found in JWT payload');
      throw new ForbiddenException(
        'Unable to verify subscription: salonId not found in token',
      );
    }

    const salonId = user.salonId;
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

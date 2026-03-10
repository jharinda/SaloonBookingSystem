import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * A lightweight guard used on the SSE controller.
 *
 * The heavy JWT verification is already done by JwtValidationMiddleware which
 * runs before every request and stamps `x-user-id` / `x-user-role` headers
 * on the Express request.  This guard simply confirms those headers are
 * present, giving the controller a declarative way to opt-in to auth.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.headers['x-user-id'];

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new UnauthorizedException('Authentication required');
    }

    return true;
  }
}

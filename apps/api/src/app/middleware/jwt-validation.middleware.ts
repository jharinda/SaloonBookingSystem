import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';

interface JwtPayload {
  sub: string;
  role: string;
  email?: string;
  salonId?: string;
  iat?: number;
  exp?: number;
}

/**
 * Determines which routes require a valid JWT.
 *
 * Public routes:
 *   - ALL  /api/auth/**
 *   - GET  /api/salons/**
 *   - GET  /api/reviews/**
 *
 * Everything else requires authentication.
 */
function requiresAuth(path: string, method: string): boolean {
  // Admin routes always require auth + role check done downstream
  if (path.startsWith('/api/admin')) return true;

  // --- Always public ---
  if (path.startsWith('/api/auth')) return false;

  // Salon reads are public; mutations are protected
  if (path.startsWith('/api/salons') && method === 'GET') return false;

  // Review reads are public; mutations are protected
  if (path.startsWith('/api/reviews') && method === 'GET') return false;

  return true;
}

@Injectable()
export class JwtValidationMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (!requiresAuth(req.path, req.method)) {
      return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ statusCode: 401, message: 'Authorization token required' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      // Forward identity to downstream microservices via custom headers.
      // http-proxy-middleware will include these in the proxied request.
      req.headers['x-user-id']   = payload.sub;
      req.headers['x-user-role'] = payload.role;
      if (payload.salonId) {
        req.headers['x-salon-id'] = payload.salonId;
      }

      next();
    } catch {
      res
        .status(401)
        .json({ statusCode: 401, message: 'Invalid or expired token' });
    }
  }
}

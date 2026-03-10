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

// Determines which routes require a valid JWT.
// Public: ALL /api/auth/**, GET /api/salons/**, GET /api/reviews/**
// Everything else requires authentication.
function requiresAuth(path: string, method: string): boolean {
  // Admin routes always require auth + role check done downstream
  if (path.startsWith('/api/admin')) return true;

  // --- Always public ---
  if (path.startsWith('/api/auth')) return false;

  // Internal push endpoint is authenticated via X-Internal-Token, not JWT
  if (path === '/api/notifications/push' && method === 'POST') return false;

  // Salon reads are public; mutations and owner-specific routes are protected
  if (path.startsWith('/api/salons') && method === 'GET' && !path.startsWith('/api/salons/owner')) return false;

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
    // Use originalUrl — Express 5 (NestJS 11) may set req.path relative
    // to the middleware mount point rather than the full request URL.
    const fullPath = req.originalUrl.split('?')[0];
    if (!requiresAuth(fullPath, req.method)) {
      return next();
    }

    // Primary: Authorization: Bearer <token>
    // Fallback: ?token= query param — used by browser EventSource for the SSE
    // stream endpoint because the EventSource API cannot send custom headers.
    const authHeader  = req.headers['authorization'];
    const queryToken  = typeof req.query?.['token'] === 'string' ? req.query['token'] as string : null;

    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : queryToken;

    if (!rawToken) {
      res
        .status(401)
        .json({ statusCode: 401, message: 'Authorization token required' });
      return;
    }

    const token = rawToken;

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

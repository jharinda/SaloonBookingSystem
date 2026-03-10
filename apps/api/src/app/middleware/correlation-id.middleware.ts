import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Ensures every request has a correlation ID for distributed tracing.
 * If the client provides one, we use it. Otherwise, generate a new UUID.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existingId = req.headers[CORRELATION_ID_HEADER];
    const correlationId = existingId || randomUUID();

    // Persist to request headers so proxy middleware forwards it
    req.headers[CORRELATION_ID_HEADER] = correlationId as string;

    // Echo back to client for debugging
    res.setHeader('X-Correlation-ID', correlationId);

    next();
  }
}

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Extracts the correlation ID from incoming request headers and stores it
 * in a request property for downstream logging, enrichment, and debugging.
 *
 * Works in tandem with the API Gateway's CorrelationIdMiddleware,
 * which ensures every request has a correlation ID.
 */
@Injectable()
export class CorrelationLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CorrelationLoggingMiddleware.name);

  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction): void {
    const correlationId = req.headers[CORRELATION_ID_HEADER] as string | undefined;

    if (correlationId) {
      // Attach to request object for services to access
      req.correlationId = correlationId;

      // Echo back in response for debugging
      res.setHeader('X-Correlation-ID', correlationId);
    }

    next();
  }
}

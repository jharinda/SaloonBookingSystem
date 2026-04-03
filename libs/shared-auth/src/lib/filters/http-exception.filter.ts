import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/node';

interface StandardErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  correlationId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const r = exResponse as Record<string, unknown>;
        message = Array.isArray(r.message) ? r.message.join(', ') : String(r.message || message);
        error = String(r.error || error);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Use the NestJS default status text for the error field
    error = HttpStatus[statusCode]
      ? HttpStatus[statusCode].toString().replace(/_/g, ' ')
      : error;

    const body: StandardErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      correlationId: request.headers?.['x-correlation-id'] as string,
    };

    if (statusCode >= 500) {
      this.logger.error(
        `[${body.correlationId || 'no-cid'}] ${statusCode} ${request.method} ${request.url}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      Sentry.captureException(exception, {
        extra: {
          correlationId: body.correlationId,
          method: request.method,
          url: request.url,
        },
      });
    }

    response.status(statusCode).json(body);
  }
}

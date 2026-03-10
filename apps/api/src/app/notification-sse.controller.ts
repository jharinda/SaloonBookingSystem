import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  MessageEvent,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sse } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';

import { Subject } from 'rxjs';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SseService } from './sse.service';

interface PushPayload {
  userId: string;
  event: string;
  data: unknown;
}

/**
 * Notification SSE gateway.
 *
 * GET  /notifications/stream  — Opens a persistent SSE stream for the
 *                               authenticated user.  Requires a valid JWT
 *                               (validated upstream by JwtValidationMiddleware;
 *                               enforced here by JwtAuthGuard).
 *
 * POST /notifications/push    — Internal-only endpoint to push an event to a
 *                               connected user.  Requires the X-Internal-Token
 *                               header to match INTERNAL_TOKEN env var.
 */
@Controller('api/notifications')
export class NotificationSseController {
  private readonly logger = new Logger(NotificationSseController.name);

  constructor(
    private readonly sseService: SseService,
    private readonly configService: ConfigService,
  ) {}

  // ── Public SSE stream ─────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Sse('stream')
  stream(@Req() req: Request): Observable<MessageEvent> {
    // The JwtValidationMiddleware stamps x-user-id after verifying the Bearer
    // token, so we can safely cast here (the guard already confirmed it exists).
    const userId = req.headers['x-user-id'] as string;

    this.logger.log(`SSE connection opened for user ${userId}`);

    const subject = new Subject<MessageEvent>();
    this.sseService.registerClient(userId, subject);

    // Clean up when the client closes the connection.
    req.on('close', () => {
      this.logger.log(`SSE connection closed for user ${userId}`);
      this.sseService.removeClient(userId);
      if (!subject.closed) subject.complete();
    });

    return subject.asObservable();
  }

  // ── Internal push endpoint ────────────────────────────────────────────────

  @Post('push')
  @HttpCode(HttpStatus.NO_CONTENT)
  push(
    @Headers('x-internal-token') token: string | undefined,
    @Body() payload: PushPayload,
  ): void {
    this.assertInternalToken(token);

    const { userId, event, data } = payload;

    this.sseService.pushToUser(userId, event, data);

    this.logger.debug(`Pushed event "${event}" to user ${userId}`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertInternalToken(provided: string | undefined): void {
    const expected = this.configService.get<string>('internalToken') ?? '';

    // If no token is configured (empty or undefined), allow all internal pushes in dev mode.
    if (!expected || expected === '') {
      return;
    }

    // In production with a token set, enforce strict matching
    if (!provided || provided !== expected) {
      throw new ForbiddenException('Invalid or missing X-Internal-Token');
    }
  }
}

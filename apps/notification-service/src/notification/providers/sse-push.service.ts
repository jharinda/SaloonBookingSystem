import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { InboxNotificationService } from '../inbox-notification.service';

/**
 * Thin wrapper around the API gateway's internal SSE push endpoint.
 * Allows notification processors to send real-time in-app notifications
 * to any connected user without caring about the underlying SSE transport.
 *
 * The gateway endpoint is: POST /api/notifications/push
 * It expects { userId, event, data } + an X-Internal-Token header.
 *
 * Failures are logged and swallowed — SSE is best-effort; email/SMS remain
 * the authoritative delivery channel.
 */
@Injectable()
export class SsePushService {
  private readonly logger = new Logger(SsePushService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly inboxService: InboxNotificationService,
  ) {}

  async push(userId: string, event: string, data: unknown): Promise<void> {
    if (!userId) {
      this.logger.warn(`SSE push skipped — no userId provided for event "${event}"`);
      return;
    }

    // 1. Always persist — this is the inbox queue for offline users.
    await this.inboxService.save(userId, event, data);

    // 2. Best-effort live delivery via SSE.
    const gatewayUrl    = this.config.get<string>('gatewayUrl') ?? 'http://localhost:3000';
    const internalToken = this.config.get<string>('internalToken') ?? '';

    try {
      await firstValueFrom(
        this.http.post(
          `${gatewayUrl}/api/notifications/push`,
          { userId, event, data },
          { headers: { 'x-internal-token': internalToken, 'content-type': 'application/json' } },
        ),
      );
      this.logger.debug(`SSE event "${event}" pushed to user ${userId}`);
    } catch (err: unknown) {
      this.logger.warn(
        `SSE push failed (event="${event}", userId=${userId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

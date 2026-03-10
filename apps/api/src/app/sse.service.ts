import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly clients = new Map<string, Subject<MessageEvent>>();

  registerClient(userId: string, subject: Subject<MessageEvent>): void {
    this.clients.set(userId, subject);
  }

  removeClient(userId: string): void {
    this.clients.delete(userId);
  }

  pushToUser(userId: string, event: string, data: unknown): void {
    const subject = this.clients.get(userId);

    if (!subject || subject.closed) {
      this.logger.warn(`pushToUser: no active SSE connection for user ${userId}`);
      return;
    }

    subject.next({ data: JSON.stringify({ event, data }) });
  }
}

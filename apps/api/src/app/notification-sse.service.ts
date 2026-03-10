import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { MessageEvent } from '@nestjs/common';

/**
 * Holds a live Subject per connected user.
 * Any part of the gateway (e.g. the /notifications/push endpoint) can
 * resolve a user's subject from this map and call .next() to push an event.
 */
@Injectable()
export class NotificationSseService {
  /** userId → live SSE subject */
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  /**
   * Create (or return existing) subject for a user and return it.
   * Call this when a client opens the SSE stream.
   */
  connect(userId: string): Subject<MessageEvent> {
    let subject = this.subjects.get(userId);
    if (!subject || subject.closed) {
      subject = new Subject<MessageEvent>();
      this.subjects.set(userId, subject);
    }
    return subject;
  }

  /**
   * Remove the subject and complete it so the Observable ends.
   * Call this when the client disconnects.
   */
  disconnect(userId: string): void {
    const subject = this.subjects.get(userId);
    if (subject) {
      this.subjects.delete(userId);
      if (!subject.closed) {
        subject.complete();
      }
    }
  }

  /**
   * Push a MessageEvent to a connected user.
   * Returns true if the user was found, false otherwise.
   */
  push(userId: string, event: MessageEvent): boolean {
    const subject = this.subjects.get(userId);
    if (!subject || subject.closed) return false;
    subject.next(event);
    return true;
  }

  /** How many clients are currently connected (useful for health checks). */
  get connectionCount(): number {
    return this.subjects.size;
  }
}

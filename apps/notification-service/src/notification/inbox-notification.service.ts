import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  InboxNotification,
  InboxNotificationDocument,
} from './schemas/inbox-notification.schema';

export interface InboxNotificationDto {
  _id: string;
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  createdAt: Date;
}

/**
 * Persists and retrieves in-app (SSE) notifications for individual users so
 * that notifications sent while a user is offline are not lost.
 */
@Injectable()
export class InboxNotificationService {
  private readonly logger = new Logger(InboxNotificationService.name);

  constructor(
    @InjectModel(InboxNotification.name)
    private readonly model: Model<InboxNotificationDocument>,
  ) {}

  /**
   * Persist a notification for `userId`.
   * Call this for every SSE push — regardless of whether the user is online —
   * so nothing is ever permanently lost.
   */
  async save(
    userId: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    try {
      await this.model.create({ userId, event, data });
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to persist inbox notification (user=${userId}, event=${event}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Return the 50 most-recent notifications for `userId`, newest first.
   * The frontend uses this to populate the bell on first load and after login.
   */
  async findForUser(userId: string): Promise<InboxNotificationDto[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    return docs.map((d) => ({
      _id:       (d._id as { toString(): string }).toString(),
      event:     d.event,
      data:      d.data,
      createdAt: (d as unknown as { createdAt: Date }).createdAt,
    }));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  InboxNotification,
  InboxNotificationDocument,
  NotificationType,
} from './schemas/inbox-notification.schema';

export interface InboxNotificationDto {
  _id: string;
  title: string;
  body: string;
  type: NotificationType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  isRead: boolean;
  createdAt: Date;
}

export interface PaginatedInboxDto {
  notifications: InboxNotificationDto[];
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
}

/**
 * Persists and retrieves notifications (email, SMS, WhatsApp, push) for users
 * so that they can see their notification history in the app (like Instagram/Facebook).
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
   * Call this for every notification sent (email, SMS, WhatsApp, push) so
   * users can view their notification history.
   */
  async save(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.model.create({
        userId,
        title,
        body,
        type,
        data: data ?? {},
        isRead: false,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to persist inbox notification (user=${userId}, type=${type}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Return paginated notifications for `userId`, newest first.
   * The frontend uses this to populate the notification inbox.
   */
  async findForUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedInboxDto> {
    const skip = (page - 1) * limit;

    const [docs, total, unreadCount] = await Promise.all([
      this.model
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments({ userId }),
      this.model.countDocuments({ userId, isRead: false }),
    ]);

    const notifications = docs.map((d) => ({
      _id: (d._id as { toString(): string }).toString(),
      title: d.title,
      body: d.body,
      type: d.type,
      data: d.data,
      isRead: d.isRead,
      createdAt: (d as unknown as { createdAt: Date }).createdAt,
    }));

    return {
      notifications,
      total,
      page,
      limit,
      unreadCount,
    };
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.model.updateOne(
      { _id: notificationId, userId },
      { $set: { isRead: true } },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.model.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } },
    );
    return result.modifiedCount;
  }

  /**
   * Get count of unread notifications for a user.
   * Used for notification bell badge.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.model.countDocuments({ userId, isRead: false });
  }
}

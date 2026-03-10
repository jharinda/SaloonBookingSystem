import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InboxNotificationDocument = HydratedDocument<InboxNotification>;

export enum NotificationType {
  BOOKING_CREATED = 'booking_created',
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_CANCELLED = 'booking_cancelled',
  BOOKING_COMPLETED = 'booking_completed',
  BOOKING_REMINDER = 'booking_reminder',
  REVIEW_REQUEST = 'review_request',
  STAFF_JOINED = 'staff_joined',
  NEW_MESSAGE = 'new_message',
  SYSTEM = 'system',
}

/**
 * Persists every notification (email, SMS, WhatsApp, push) so that users can
 * see their notification history in the app (like Instagram/Facebook).
 *
 * Documents are automatically expired after 30 days via a MongoDB TTL index.
 */
@Schema({ timestamps: true })
export class InboxNotification {
  /** The user this notification belongs to. */
  @Prop({ required: true, index: true })
  userId: string;

  /** Notification title for display in inbox */
  @Prop({ required: true })
  title: string;

  /** Notification body/message */
  @Prop({ required: true })
  body: string;

  /** Notification type/category */
  @Prop({
    required: true,
    enum: Object.values(NotificationType),
    default: NotificationType.SYSTEM,
  })
  type: NotificationType;

  /** Arbitrary event payload/metadata */
  @Prop({ type: Object, default: {} })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;

  /** Whether the user has read this notification */
  @Prop({ default: false, index: true })
  isRead: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const InboxNotificationSchema =
  SchemaFactory.createForClass(InboxNotification);

// Compound index for efficient queries by userId + createdAt (descending)
InboxNotificationSchema.index({ userId: 1, createdAt: -1 });

// Compound index for filtering unread notifications
InboxNotificationSchema.index({ userId: 1, isRead: 1 });

// Auto-expire documents after 30 days.
InboxNotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);

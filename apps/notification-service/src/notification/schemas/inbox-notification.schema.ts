import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InboxNotificationDocument = HydratedDocument<InboxNotification>;

/**
 * Persists every in-app (SSE) notification so that users who were offline at
 * the time of delivery can still see it when they next open the app.
 *
 * Documents are automatically expired after 30 days via a MongoDB TTL index.
 */
@Schema({ timestamps: true })
export class InboxNotification {
  /** The user this notification belongs to. */
  @Prop({ required: true, index: true })
  userId: string;

  /** Event name, e.g. "review.posted", "booking.new". */
  @Prop({ required: true })
  event: string;

  /** Arbitrary event payload. */
  @Prop({ type: Object, required: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

export const InboxNotificationSchema =
  SchemaFactory.createForClass(InboxNotification);

// Auto-expire documents after 30 days.
InboxNotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);

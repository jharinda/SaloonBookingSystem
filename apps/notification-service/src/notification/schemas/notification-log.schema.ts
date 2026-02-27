import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { NotificationChannel, TemplateType } from '../constants/notification-events.constants';

export type NotificationLogDocument = HydratedDocument<NotificationLog>;

export enum NotificationStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class NotificationLog {
  @Prop({ required: true, enum: TemplateType })
  templateType: TemplateType;

  @Prop({ required: true, enum: NotificationChannel })
  channel: NotificationChannel;

  @Prop({ required: true })
  recipient: string; // email address or E.164 phone number

  @Prop({ required: true, enum: NotificationStatus })
  status: NotificationStatus;

  /** Provider message-id returned on success */
  @Prop({ default: null })
  providerMessageId: string | null;

  /** Error message on failure */
  @Prop({ default: null })
  error: string | null;

  /** Booking ID this notification relates to */
  @Prop({ required: true })
  bookingId: string;

  createdAt: Date;
}

export const NotificationLogSchema =
  SchemaFactory.createForClass(NotificationLog);

NotificationLogSchema.index({ bookingId: 1, channel: 1 });

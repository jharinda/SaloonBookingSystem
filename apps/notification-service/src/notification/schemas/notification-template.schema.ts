import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { NotificationChannel, TemplateType } from '../constants/notification-events.constants';

export type NotificationTemplateDocument = HydratedDocument<NotificationTemplate>;

@Schema({ timestamps: true })
export class NotificationTemplate {
  /** Unique key used to look up the template, e.g. booking_created */
  @Prop({ required: true, unique: true, enum: TemplateType })
  type: TemplateType;

  @Prop({ required: true, enum: NotificationChannel })
  channel: NotificationChannel;

  /** Human-readable label */
  @Prop({ required: true })
  name: string;

  /** Email subject / SMS header. Supports Handlebars variables: {{clientName}}, {{salonName}}, etc. */
  @Prop({ required: true })
  subject: string;

  /**
   * Message body.
   * Available variables:
   *   {{clientName}}   — recipient full name
   *   {{salonName}}    — salon display name
   *   {{serviceName}}  — comma-joined service names
   *   {{date}}         — formatted appointment date
   *   {{time}}         — start time (HH:mm)
   *   {{address}}      — salon address
   *   {{totalPrice}}   — total booking price
   *   {{reason}}       — cancellation reason (if applicable)
   */
  @Prop({ required: true })
  body: string;

  /** Whether this template is currently active */
  @Prop({ default: true })
  active: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationTemplateSchema =
  SchemaFactory.createForClass(NotificationTemplate);

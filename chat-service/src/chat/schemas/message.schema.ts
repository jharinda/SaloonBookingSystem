import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

export enum MessageChannel {
  INTERNAL = 'internal',
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
}

export enum SenderRole {
  CLIENT = 'client',
  SALON_OWNER = 'salon_owner',
  STYLIST = 'stylist',
  BOT = 'bot',
}

export enum DeliveryStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
}

/**
 * Message represents a single message in a conversation.
 * Messages can be text, media, or both.
 */
@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class Message {
  /** The conversation this message belongs to */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: MongooseSchema.Types.ObjectId;

  /** User ID of the sender */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
  })
  senderId: MongooseSchema.Types.ObjectId;

  /** Display name of the sender */
  @Prop({ type: String, required: true })
  senderName: string;

  /** Role of the sender */
  @Prop({
    type: String,
    enum: Object.values(SenderRole),
    required: true,
  })
  senderRole: SenderRole;

  /** Message body/text content */
  @Prop({ type: String, required: true })
  body: string;

  /** Optional media URL (image, video, etc.) */
  @Prop({ type: String, default: null })
  mediaUrl: string | null;

  /** Channel this message was sent through */
  @Prop({
    type: String,
    enum: Object.values(MessageChannel),
    required: true,
  })
  channel: MessageChannel;

  /** Delivery status of the message */
  @Prop({
    type: String,
    enum: Object.values(DeliveryStatus),
    default: DeliveryStatus.SENT,
  })
  deliveryStatus: DeliveryStatus;

  /** Soft delete flag */
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ createdAt: -1 });

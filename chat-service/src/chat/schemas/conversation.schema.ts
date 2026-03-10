import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

export enum ConversationChannel {
  INTERNAL = 'internal',
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
}

export interface LastMessage {
  body: string;
  senderId: MongooseSchema.Types.ObjectId;
  sentAt: Date;
}

export interface LastReadAt {
  userId: MongooseSchema.Types.ObjectId;
  readAt: Date;
}

/**
 * Conversation represents a chat thread between a client and a salon.
 * Can be an internal chat, WhatsApp thread, or Instagram DM thread.
 */
@Schema({ timestamps: true })
export class Conversation {
  /** Participants in the conversation (client and salon) */
  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId }],
    required: true,
  })
  participants: MongooseSchema.Types.ObjectId[];

  /** The salon involved in this conversation */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  salonId: MongooseSchema.Types.ObjectId;

  /** The client involved in this conversation */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  clientId: MongooseSchema.Types.ObjectId;

  /** Channel type for this conversation */
  @Prop({
    type: String,
    enum: Object.values(ConversationChannel),
    default: ConversationChannel.INTERNAL,
  })
  channel: ConversationChannel;

  /** External thread ID for WhatsApp/Instagram integration */
  @Prop({ type: String, default: null })
  externalThreadId: string | null;

  /** Last message in the conversation for quick preview */
  @Prop({
    type: {
      body: String,
      senderId: MongooseSchema.Types.ObjectId,
      sentAt: Date,
    },
    default: null,
  })
  lastMessage: LastMessage | null;

  /** Track when each participant last read the conversation */
  @Prop({
    type: [
      {
        userId: { type: MongooseSchema.Types.ObjectId, required: true },
        readAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  lastReadAt: LastReadAt[];

  /** Whether the conversation is archived */
  @Prop({ type: Boolean, default: false })
  isArchived: boolean;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes
ConversationSchema.index({ salonId: 1, clientId: 1 }, { unique: true });
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ 'lastMessage.sentAt': -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type WaitlistEntryDocument = HydratedDocument<WaitlistEntry>;

export type WaitlistStatus = 'waiting' | 'notified' | 'booked' | 'expired';

@Schema({ _id: true })
class WaitlistService {
  @Prop({ type: Types.ObjectId, required: true })
  serviceId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 1 })
  durationMinutes: number;
}

@Schema({ timestamps: true })
export class WaitlistEntry extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Salon', required: true })
  salonId: Types.ObjectId;

  @Prop({ required: true })
  appointmentDate: Date;

  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  preferredStartTime: string;

  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  preferredEndTime: string;

  @Prop({ type: String, default: null })
  stylistId: string | null;

  @Prop({ type: [WaitlistService], required: true })
  services: WaitlistService[];

  @Prop({
    type: String,
    enum: ['waiting', 'notified', 'booked', 'expired'],
    default: 'waiting',
  })
  status: WaitlistStatus;

  @Prop({ type: Date, default: null })
  notifiedAt: Date | null;
}

export const WaitlistEntrySchema = SchemaFactory.createForClass(WaitlistEntry);

// Index for efficient waitlist lookups on cancellation
WaitlistEntrySchema.index({ salonId: 1, appointmentDate: 1, status: 1 });
// Index for client-specific queries
WaitlistEntrySchema.index({ clientId: 1, status: 1 });
// TTL support — expired docs are cleaned up by the cron job, not by Mongo TTL,
// so we don't set `expireAfterSeconds` here.

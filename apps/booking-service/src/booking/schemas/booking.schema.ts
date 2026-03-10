import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type BookingDocument = HydratedDocument<Booking>;

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

@Schema({ _id: true })
class BookedService {
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
export class Booking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Salon', required: true })
  salonId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  stylistId: Types.ObjectId | null;

  @Prop({ default: '' })
  stylistName: string;

  @Prop({ default: false })
  assignedAutomatically: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Station', default: null })
  stationId: Types.ObjectId | null;

  @Prop({ default: '' })
  stationName: string;

  @Prop({ type: [BookedService], default: [] })
  services: BookedService[];

  @Prop({ required: true })
  appointmentDate: Date;

  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  startTime: string;

  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  endTime: string;

  @Prop({
    required: true,
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @Prop({ required: true, min: 0 })
  totalPrice: number;

  /** Denormalised salon name stored at booking time for fast display */
  @Prop({ default: '' })
  salonName: string;

  /** Denormalised client name stored at booking time for fast display */
  @Prop({ default: '' })
  clientName: string;

  @Prop({ default: null })
  notes: string | null;

  @Prop({ default: 'Asia/Colombo' })
  salonTimezone: string;

  @Prop({ default: null })
  googleEventId: string | null;

  @Prop({
    type: String,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending',
  })
  calendarSyncStatus: 'pending' | 'synced' | 'failed';

  @Prop({ default: null })
  cancelledBy: string | null;

  @Prop({ default: null })
  cancellationReason: string | null;

  /** If this booking was rescheduled, stores the original appointment date for audit trail */
  @Prop({ default: null })
  rescheduledFrom: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

// Compound index for availability checks and dashboard queries
BookingSchema.index({ salonId: 1, appointmentDate: 1, status: 1 });
// Quick look-up for a client's booking history
BookingSchema.index({ clientId: 1, appointmentDate: -1 });
// Stylist-specific booking queries with status filtering
BookingSchema.index({ stylistId: 1, appointmentDate: 1, status: 1 });
// Fast filtering by booking status
BookingSchema.index({ status: 1 });

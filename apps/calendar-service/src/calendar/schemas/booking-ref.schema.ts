/**
 * Read-only Booking reference for iCal download. Uses the booking-service
 * database via the `booking` Mongoose connection (see app.module).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BookingDocument = HydratedDocument<Booking>;

@Schema({ collection: 'bookings', timestamps: true })
export class Booking {
  @Prop({ type: Types.ObjectId }) clientId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) salonId: Types.ObjectId;
  @Prop({ type: Array, default: [] }) services: unknown[];
  @Prop() appointmentDate: Date;
  @Prop() startTime: string;
  @Prop() endTime: string;
  @Prop({ default: 0 }) totalPrice: number;
  @Prop({ default: null }) notes: string | null;
  @Prop({ default: null }) googleEventId: string | null;
  @Prop() status: string;
  // Denormalised fields populated by booking-service when emitting events
  @Prop({ default: null }) salonName: string | null;
  @Prop({ default: null }) salonAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const BookingRefSchema = SchemaFactory.createForClass(Booking);

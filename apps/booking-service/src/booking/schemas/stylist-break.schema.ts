import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StylistBreakDocument = HydratedDocument<StylistBreak>;

export enum BreakType {
  LUNCH = 'LUNCH',
  COFFEE = 'COFFEE',
  PERSONAL = 'PERSONAL',
  OTHER = 'OTHER',
}

@Schema({ timestamps: true })
export class StylistBreak {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  stylistId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Salon', required: true })
  salonId: Types.ObjectId;

  /** ISO date string: "2026-03-15" */
  @Prop({ required: true, type: Date })
  date: Date;

  /** "HH:mm" */
  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  startTime: string;

  /** "HH:mm" */
  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  endTime: string;

  @Prop({
    required: true,
    enum: BreakType,
    default: BreakType.LUNCH,
  })
  type: BreakType;

  @Prop({ default: '' })
  note: string;

  createdAt: Date;
  updatedAt: Date;
}

export const StylistBreakSchema = SchemaFactory.createForClass(StylistBreak);

StylistBreakSchema.index({ stylistId: 1, date: 1 });

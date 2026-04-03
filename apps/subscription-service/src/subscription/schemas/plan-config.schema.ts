import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlanEntryDocument = PlanEntry & Document;

@Schema({ timestamps: true, collection: 'plan_configs' })
export class PlanEntry {
  @Prop({ type: String, required: true, unique: true, index: true })
  key: string;

  @Prop({ required: true })
  name: string;

  /** Monthly price in LKR; 0 = free */
  @Prop({ required: true, default: 0 })
  price: number;

  /** Trial duration in days; null = no trial */
  @Prop({ type: Number, default: null })
  trialDays: number | null;

  /** -1 = unlimited */
  @Prop({ required: true, default: 1 })
  maxLocations: number;

  /** -1 = unlimited */
  @Prop({ required: true, default: 3 })
  maxStaff: number;

  /** -1 = unlimited */
  @Prop({ required: true, default: 2 })
  maxStations: number;

  @Prop({ type: [String], default: [] })
  features: string[];
}

export const PlanEntrySchema = SchemaFactory.createForClass(PlanEntry);

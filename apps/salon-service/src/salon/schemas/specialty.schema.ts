import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Specialty extends Document {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ type: String, default: null, trim: true })
  description: string | null;

  @Prop({ type: String, default: null, trim: true })
  category: string | null;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const SpecialtySchema = SchemaFactory.createForClass(Specialty);

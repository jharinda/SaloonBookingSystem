import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GoogleTokenDocument = HydratedDocument<GoogleToken>;

@Schema({ timestamps: true })
export class GoogleToken {
  /** SnapSalon user id — one record per user */
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  /** The Google account email this token belongs to */
  @Prop({ required: true })
  googleEmail: string;

  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  /** Epoch ms — used to decide whether to refresh before API calls */
  @Prop({ required: true })
  expiryDate: number;

  createdAt: Date;
  updatedAt: Date;
}

export const GoogleTokenSchema = SchemaFactory.createForClass(GoogleToken);

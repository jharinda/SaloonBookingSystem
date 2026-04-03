import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import type {
  JoinRequestStatus,
  WorkingHours,
  PortfolioImage,
  PortfolioReview,
} from '@org/models';

export type UserProfileDocument = HydratedDocument<UserProfile>;

export interface StylistProfile {
  bio?: string;
  specialties: string[];
  yearsExperience: number;
  portfolioImages: PortfolioImage[];
  portfolioReviews: PortfolioReview[];
  currentSalonId?: MongooseSchema.Types.ObjectId | null;
  joinRequestStatus: JoinRequestStatus;
  isAvailable: boolean;
  workingHours: WorkingHours[];
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class UserProfile extends Document {
  @Prop({ required: true, unique: true, index: true })
  userId: string; // Synced from auth-service

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true })
  role: string; // 'client' | 'salon_owner' | 'stylist' | 'admin'

  @Prop({ type: String, default: null })
  phone: string | null;

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  @Prop({
    type: Object,
    default: null,
  })
  address?: Address | null;

  @Prop({ type: String, default: 'UTC' })
  timezone: string;

  /** ISO 4217 currency code — resolved from the user's region */
  @Prop({ type: String, default: 'LKR' })
  currency: string;

  @Prop({
    type: Object,
    default: { email: true, sms: false, whatsapp: false, push: false },
  })
  notificationPreferences: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };

  @Prop({
    type: Object,
    default: null,
  })
  stylistProfile?: StylistProfile | null;

  @Prop({ type: [String], default: [] })
  favoriteSalonIds: string[];

  createdAt: Date;
  updatedAt: Date;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);

// Create indexes for common queries (email and userId already indexed via @Prop)
UserProfileSchema.index({ role: 1 });

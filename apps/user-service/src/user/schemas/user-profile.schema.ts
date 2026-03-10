import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type UserProfileDocument = HydratedDocument<UserProfile>;

export type JoinRequestStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface WorkingHours {
  day: number; // 0-6 (Sunday to Saturday)
  start: string;
  end: string;
  isOff: boolean;
}

export interface PortfolioImage {
  cloudinaryId: string;
  url: string;
  caption?: string;
}

export interface PortfolioReview {
  reviewId: string;
  salonId: string;
  rating: number;
  comment: string;
  serviceName: string;
  clientName: string;
  date: Date;
}

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

  createdAt: Date;
  updatedAt: Date;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);

// Create indexes for common queries
UserProfileSchema.index({ email: 1 });
UserProfileSchema.index({ userId: 1 });
UserProfileSchema.index({ role: 1 });

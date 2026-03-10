import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { UserRole } from '../dto/register.dto';

export type UserDocument = HydratedDocument<User>;

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

export interface FcmToken {
  token: string;
  device: string; // 'web' | 'android' | 'ios'
  createdAt: Date;
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class User extends Document {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ type: String, default: null })
  passwordHash: string | null;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ type: String, required: true, enum: Object.values(UserRole), default: UserRole.CLIENT })
  role: UserRole;

  @Prop({ type: String, default: null })
  refreshToken: string | null;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ type: String, default: null })
  googleId: string | null;

  @Prop({ type: String, default: null })
  phone: string | null;

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  @Prop({ default: true })
  isActive: boolean;

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

  @Prop({
    type: [
      {
        token: { type: String, required: true },
        device: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  fcmTokens: FcmToken[];

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Exclude passwordHash and refreshToken from JSON serialisation
UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.refreshToken;
    return ret;
  },
});

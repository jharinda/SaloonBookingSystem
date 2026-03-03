import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';
import { UserRole } from '../dto/register.dto';

export type UserDocument = HydratedDocument<User>;

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

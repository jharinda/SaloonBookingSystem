import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';
import { UserRole } from '../dto/register.dto';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class User extends Document {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ type: String, required: true, enum: UserRole, default: UserRole.CLIENT })
  role: UserRole;

  @Prop({ type: String, default: null })
  refreshToken: string | null;

  @Prop({ default: false })
  isEmailVerified: boolean;

  createdAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Exclude password and refreshToken from JSON serialisation
UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.refreshToken;
    return ret;
  },
});

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

export type SubscriptionPlan = 'starter' | 'basic' | 'pro' | 'franchise';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled';

export class PaymentHistoryEntry {
  @Prop({ required: true })
  orderId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, default: 'LKR' })
  currency: string;

  @Prop({ required: true })
  status: string;

  @Prop({ required: true })
  paidAt: Date;
}

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: String, required: true, unique: true })
  salonId: string;

  @Prop({
    type: String,
    enum: ['starter', 'basic', 'pro', 'franchise'],
    required: true,
    default: 'starter',
  })
  plan: SubscriptionPlan;

  @Prop({
    type: String,
    enum: ['trial', 'active', 'past_due', 'cancelled'],
    required: true,
    default: 'trial',
  })
  status: SubscriptionStatus;

  @Prop({ type: Date })
  startDate: Date;

  @Prop({ type: Date })
  trialEndsAt: Date;

  @Prop({ type: Date, default: null })
  currentPeriodEnd: Date | null;

  @Prop({ type: String, default: null })
  payhereOrderId: string | null;

  @Prop({ type: [{ orderId: String, amount: Number, currency: String, status: String, paidAt: Date }], default: [] })
  paymentHistory: PaymentHistoryEntry[];

  // injected by timestamps: true
  createdAt: Date;
  updatedAt: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// Unique index for one subscription per salon (already enforced via @Prop unique: true)
// This explicit index declaration ensures proper query performance
SubscriptionSchema.index({ salonId: 1 }, { unique: true });

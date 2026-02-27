import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ _id: false })
class ReviewImage {
  @Prop({ required: true }) cloudinaryId: string;
  @Prop({ required: true }) url: string;
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class Review extends Document {
  @Prop({ required: true, index: true })
  salonId: string;

  @Prop({ required: true })
  bookingId: string;

  @Prop({ required: true, index: true })
  clientId: string;

  /** Optional — set when the booking was with a specific stylist */
  @Prop({ type: String, default: null })
  stylistId: string | null;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ type: String, maxlength: 500, default: null })
  comment: string | null;

  @Prop({ type: [ReviewImage], default: [] })
  images: ReviewImage[];

  /** Soft-delete: admin sets to false to hide a review */
  @Prop({ default: true })
  isVisible: boolean;

  /** Salon owner's public response to the review */
  @Prop({ type: String, default: null })
  ownerReply: string | null;

  createdAt: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// One review per booking
ReviewSchema.index({ bookingId: 1 }, { unique: true });
// Fast paginated queries for a salon's reviews, newest first
ReviewSchema.index({ salonId: 1, createdAt: -1 });
// Fast paginated queries for a stylist's reviews
ReviewSchema.index({ stylistId: 1, createdAt: -1 });

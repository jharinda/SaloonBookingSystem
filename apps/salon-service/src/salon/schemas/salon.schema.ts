import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type SalonDocument = HydratedDocument<Salon>;

// ── Embedded sub-schemas ────────────────────────────────────────────────────

@Schema({ _id: false })
class Address {
  @Prop({ required: true, trim: true }) street: string;
  @Prop({ required: true, trim: true }) city: string;
  @Prop({ required: true, trim: true }) province: string;
  @Prop({ required: true }) lat: number;
  @Prop({ required: true }) lng: number;
}

@Schema({ _id: false })
class GeoPoint {
  @Prop({ type: String, enum: ['Point'], default: 'Point' }) type: string;
  @Prop({ type: [Number], required: true }) coordinates: number[]; // [lng, lat]
}

@Schema({ _id: false })
class OperatingHours {
  @Prop({ required: true, min: 0, max: 6 }) day: number;
  @Prop({ required: true }) open: string;
  @Prop({ required: true }) close: string;
  @Prop({ default: false }) closed: boolean;
}

@Schema({ _id: true })
class ServiceItem {
  @Prop({ required: true, trim: true }) name: string;
  @Prop() description?: string;
  @Prop({ required: true, min: 0 }) price: number;
  @Prop({ required: true, min: 1 }) durationMinutes: number;
  @Prop({ required: true }) category: string;
}

@Schema({ _id: false })
class SalonImage {
  @Prop({ required: true }) cloudinaryId: string;
  @Prop({ required: true }) url: string;
  @Prop({ default: false }) isPrimary: boolean;
}

// ── Root schema ─────────────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class Salon extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Franchise', default: null })
  franchiseId: Types.ObjectId | null;

  @Prop({ type: Address, required: true })
  address: Address;

  /** GeoJSON Point — kept in sync with address.lat/lng for $near queries */
  @Prop({ type: GeoPoint })
  location: GeoPoint;

  @Prop({ type: [OperatingHours], default: [] })
  operatingHours: OperatingHours[];

  @Prop({ type: [ServiceItem], default: [] })
  services: ServiceItem[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  staff: Types.ObjectId[];

  @Prop({ type: [SalonImage], default: [] })
  images: SalonImage[];

  @Prop({ default: false })
  isApproved: boolean;

  @Prop({ default: 0, min: 0, max: 5 })
  rating: number;

  @Prop({ default: 0, min: 0 })
  reviewCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export const SalonSchema = SchemaFactory.createForClass(Salon);

// Geospatial index — required for $near / $geoNear queries
SalonSchema.index({ location: '2dsphere' });

// Text index — enables $text search across service names, categories and salon name
SalonSchema.index(
  { name: 'text', 'services.name': 'text', 'services.category': 'text' },
  { weights: { name: 3, 'services.name': 2, 'services.category': 1 } },
);

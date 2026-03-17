import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  IsObject,
  ValidateNested,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddressDto {
  @IsString()
  street: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  zipCode: string;

  @IsString()
  country: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  email: boolean;

  @IsBoolean()
  sms: boolean;

  @IsBoolean()
  whatsapp: boolean;

  @IsBoolean()
  push: boolean;
}

export class UpdateStylistProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  yearsExperience?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class AddPortfolioImageDto {
  @IsString()
  cloudinaryId: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class AddPortfolioReviewDto {
  @IsString()
  reviewId: string;

  @IsString()
  salonId: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  comment: string;

  @IsString()
  serviceName: string;

  @IsString()
  clientName: string;

  @IsString()
  date: string;
}

export class WorkingHoursDto {
  @IsNumber()
  @Min(0)
  @Max(6)
  day: number;

  @IsString()
  start: string;

  @IsString()
  end: string;

  @IsBoolean()
  isOff: boolean;
}

export class UserProfileResponseDto {
  _id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: string;
  timezone: string;
  currency: string;
  address?: AddressDto;
  notificationPreferences: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };
  stylistProfile?: {
    bio?: string;
    specialties: string[];
    yearsExperience: number;
    portfolioImages: Array<{
      cloudinaryId: string;
      url: string;
      caption?: string;
    }>;
    portfolioReviews: Array<{
      reviewId: string;
      salonId: string;
      rating: number;
      comment: string;
      serviceName: string;
      clientName: string;
      date: Date;
    }>;
    currentSalonId?: string;
    joinRequestStatus: string;
    isAvailable: boolean;
    workingHours: Array<{
      day: number;
      start: string;
      end: string;
      isOff: boolean;
    }>;
  };
  createdAt: string;
  updatedAt: string;
}

export class NotificationPreferencesResponseDto {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
}

export class CreateUserProfileDto {
  @IsString()
  userId: string;

  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  role: string;
}

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
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  NotificationPreferences,
  UpdateProfilePayload,
  UserProfileResponse,
  AddressPayload,
  WorkingHours,
  PortfolioImage,
  StylistProfileShape,
} from '@org/models';

export class AddressDto implements AddressPayload {
  @IsString()
  street!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  zipCode!: string;

  @IsString()
  country!: string;
}

export class UpdateProfileDto implements UpdateProfilePayload {
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
  @Matches(/^(\+94)?[0-9]{9,10}$/, { message: 'Phone must be a valid Sri Lanka number (+94XXXXXXXXX)' })
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

export class UpdateNotificationPreferencesDto implements Partial<NotificationPreferences> {
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;
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

export class AddPortfolioImageDto implements PortfolioImage {
  @IsString()
  cloudinaryId!: string;

  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class AddPortfolioReviewDto {
  @IsString()
  reviewId!: string;

  @IsString()
  salonId!: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  comment!: string;

  @IsString()
  serviceName!: string;

  @IsString()
  clientName!: string;

  @IsString()
  date!: string;
}

export class WorkingHoursDto implements WorkingHours {
  @IsNumber()
  @Min(0)
  @Max(6)
  day!: number;

  @IsString()
  start!: string;

  @IsString()
  end!: string;

  @IsBoolean()
  isOff!: boolean;
}

export class UserProfileResponseDto implements UserProfileResponse {
  _id!: string;
  userId!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  phone?: string;
  avatarUrl?: string;
  role!: string;
  timezone!: string;
  currency!: string;
  address?: AddressDto;
  notificationPreferences!: NotificationPreferences;
  stylistProfile?: StylistProfileShape;
  createdAt!: string;
  updatedAt!: string;
}

export class NotificationPreferencesResponseDto implements NotificationPreferences {
  email!: boolean;
  sms!: boolean;
  whatsapp!: boolean;
  push!: boolean;
}

export class CreateUserProfileDto {
  @IsString()
  userId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  role!: string;
}

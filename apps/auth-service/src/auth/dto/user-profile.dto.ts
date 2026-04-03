import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type {
  NotificationPreferences,
  UpdateProfilePayload,
  UserProfileResponse,
} from '@org/models';
import { StylistProfileResponse } from './auth-response.dto';

export class UpdateProfileDto implements UpdateProfilePayload {
  @IsString()
  @MaxLength(50)
  firstName!: string;

  @IsString()
  @MaxLength(50)
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateNotificationPreferencesDto implements NotificationPreferences {
  @IsBoolean()
  email!: boolean;

  @IsBoolean()
  sms!: boolean;

  @IsBoolean()
  whatsapp!: boolean;

  @IsBoolean()
  push!: boolean;
}

export class UserProfileResponseDto implements UserProfileResponse {
  _id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  phone?: string;
  avatarUrl?: string;
  role!: string;
  createdAt!: string;
  stylistProfile?: StylistProfileResponse;
  notificationPreferences?: NotificationPreferences;
}

export class ConnectedAccountsResponseDto {
  google?: { email: string };
}

export class NotificationPreferencesResponseDto implements NotificationPreferences {
  email!: boolean;
  sms!: boolean;
  whatsapp!: boolean;
  push!: boolean;
}

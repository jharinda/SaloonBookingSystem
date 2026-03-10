import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { StylistProfileResponse } from './auth-response.dto';

export class UpdateProfileDto {
  @IsString()
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MaxLength(50)
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;
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

export class UserProfileResponseDto {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
  stylistProfile?: StylistProfileResponse;
}

export class ConnectedAccountsResponseDto {
  google?: { email: string };
}

export class NotificationPreferencesResponseDto {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
}

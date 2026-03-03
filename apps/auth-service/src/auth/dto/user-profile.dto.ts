import {
  IsBoolean,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';

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
  @IsOptional()
  @IsBoolean()
  emailBookingConfirmations?: boolean;

  @IsOptional()
  @IsBoolean()
  emailReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  smsReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappMessages?: boolean;
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
}

export class ConnectedAccountsResponseDto {
  google?: { email: string };
}

export class NotificationPreferencesResponseDto {
  emailBookingConfirmations: boolean;
  emailReminders: boolean;
  smsReminders: boolean;
  whatsappMessages: boolean;
}

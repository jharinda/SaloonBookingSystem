import { IsString, IsEnum, IsNotEmpty } from 'class-validator';

export enum DeviceType {
  WEB = 'web',
  ANDROID = 'android',
  IOS = 'ios',
}

export class AddFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsEnum(DeviceType)
  device: DeviceType;
}

export class RemoveFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

export interface FcmTokenInfo {
  token: string;
  device: string;
  createdAt: Date;
}

export interface FcmTokensResponseDto {
  userId: string;
  tokens: FcmTokenInfo[];
}

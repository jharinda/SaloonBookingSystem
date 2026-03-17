import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto, ImageDto, OperatingHoursDto, ServiceItemDto } from './create-salon.dto';

export class BreakLimitsDto {
  @IsNumber() @Min(0) @IsOptional() LUNCH?: number;
  @IsNumber() @Min(0) @IsOptional() COFFEE?: number;
  @IsNumber() @Min(0) @IsOptional() PERSONAL?: number;
  @IsNumber() @Min(0) @IsOptional() OTHER?: number;
}

export class UpdateSalonDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail({}, { message: 'Invalid salon email address' })
  @IsOptional()
  email?: string;

  @ValidateNested()
  @Type(() => AddressDto)
  @IsOptional()
  address?: AddressDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperatingHoursDto)
  @IsOptional()
  operatingHours?: OperatingHoursDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  @IsOptional()
  services?: ServiceItemDto[];

  @IsBoolean()
  @IsOptional()
  autoConfirmBookings?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  cancellationWindowHours?: number;

  @ValidateNested()
  @Type(() => BreakLimitsDto)
  @IsOptional()
  breakLimits?: BreakLimitsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageDto)
  @IsOptional()
  images?: ImageDto[];
}

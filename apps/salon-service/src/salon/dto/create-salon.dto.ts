import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddressDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  province: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class OperatingHoursDto {
  @IsNumber()
  @Min(0)
  @Max(6)
  day: number;

  @IsString()
  @IsNotEmpty()
  open: string; // e.g. "09:00"

  @IsString()
  @IsNotEmpty()
  close: string; // e.g. "18:00"

  @IsBoolean()
  closed: boolean;
}

export class ServiceItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(1)
  durationMinutes: number;

  @IsString()
  @IsNotEmpty()
  category: string;
}

export class ImageDto {
  @IsString()
  @IsNotEmpty()
  cloudinaryId: string;

  @IsUrl()
  url: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class CreateSalonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEmail({}, { message: 'Invalid salon email address' })
  email: string;

  @IsMongoId()
  @IsOptional()
  franchiseId?: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageDto)
  @IsOptional()
  images?: ImageDto[];
}

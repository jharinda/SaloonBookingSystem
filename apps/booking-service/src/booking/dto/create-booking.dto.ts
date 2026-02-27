import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BookedServiceDto {
  @IsMongoId()
  serviceId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(1)
  durationMinutes: number;
}

export class CreateBookingDto {
  @IsMongoId()
  salonId: string;

  @IsMongoId()
  @IsOptional()
  stylistId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookedServiceDto)
  services: BookedServiceDto[];

  /** ISO-8601 date string, e.g. "2026-03-15" */
  @IsDateString()
  appointmentDate: string;

  /** HH:mm, e.g. "14:00" */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

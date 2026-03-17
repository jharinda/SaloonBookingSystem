import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '../schemas/booking.schema';

export class AvailableSlotsQueryDto {
  @IsMongoId()
  salonId: string;

  /** ISO-8601 date string, e.g. "2026-03-15" */
  @IsDateString()
  date: string;

  /** Total duration of the booked services in minutes */
  @IsNumber()
  @Min(15)
  @Max(480)
  @Type(() => Number)
  durationMinutes: number;

  /** Optional – filter availability for a specific stylist */
  @IsOptional()
  @IsMongoId()
  stylistId?: string;
}

export class BookingListQueryDto {
  @IsOptional()
  @IsMongoId()
  salonId?: string;

  @IsOptional()
  @IsMongoId()
  stylistId?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

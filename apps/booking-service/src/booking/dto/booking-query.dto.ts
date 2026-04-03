import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '@org/models';

export class AvailableSlotsQueryDto {
  @ApiProperty({ description: 'Salon ID', example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  salonId: string;

  /** ISO-8601 date string, e.g. "2026-03-15" */
  @ApiProperty({ description: 'Date in YYYY-MM-DD format', example: '2026-04-06' })
  @IsDateString()
  date: string;

  /** Total duration of the booked services in minutes */
  @ApiProperty({ description: 'Total service duration in minutes', example: 60, minimum: 15, maximum: 480 })
  @IsNumber()
  @Min(15)
  @Max(480)
  @Type(() => Number)
  durationMinutes: number;

  /** Optional – filter availability for a specific stylist */
  @ApiPropertyOptional({ description: 'Optional stylist ID to scope slots', example: '507f1f77bcf86cd799439012' })
  @IsOptional()
  @IsMongoId()
  stylistId?: string;
}

export class BookingListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by salon ID', example: '507f1f77bcf86cd799439011' })
  @IsOptional()
  @IsMongoId()
  salonId?: string;

  @ApiPropertyOptional({ description: 'Filter by stylist ID', example: '507f1f77bcf86cd799439012' })
  @IsOptional()
  @IsMongoId()
  stylistId?: string;

  /** Match bookings that include this service in `services[]` */
  @ApiPropertyOptional({ description: 'Filter by service ID present on booking' })
  @IsOptional()
  @IsMongoId()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by booking status', enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'Filter by appointment date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Range start (appointment date, YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Range end (appointment date, YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size', example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  /**
   * Sort field. Use `IsString` + `IsIn` (not `IsEnum`) so ValidationPipe whitelist
   * reliably sees decorators with `forbidNonWhitelisted` (string enums can be stripped).
   */
  @ApiPropertyOptional({ description: 'Sort field', enum: ['appointment', 'createdAt'] })
  @IsOptional()
  @IsString()
  @IsIn(['appointment', 'createdAt'])
  sortBy?: string;

  /** Sort direction when using `sortBy=createdAt` (newest first = `desc`). */
  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: string;
}

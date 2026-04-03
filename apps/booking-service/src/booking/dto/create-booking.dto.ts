import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Catalog service ID', example: '507f1f77bcf86cd799439020' })
  @IsMongoId()
  serviceId: string;

  @ApiProperty({ description: 'Service display name', example: 'Haircut' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Price in smallest currency unit', example: 2500 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Duration in minutes', example: 30, minimum: 1 })
  @IsNumber()
  @Min(1)
  durationMinutes: number;
}

export class CreateBookingDto {
  @ApiProperty({ description: 'Salon ID', example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  salonId: string;

  @ApiPropertyOptional({ description: 'Salon display name (denormalised)' })
  @IsString()
  @IsOptional()
  salonName?: string;

  @ApiPropertyOptional({ description: 'Assigned stylist ID', example: '507f1f77bcf86cd799439012' })
  @IsMongoId()
  @IsOptional()
  stylistId?: string;

  @ApiProperty({ type: [BookedServiceDto], description: 'Booked services' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookedServiceDto)
  services: BookedServiceDto[];

  /** ISO-8601 date string, e.g. "2026-03-15" */
  @ApiProperty({ description: 'Appointment date (YYYY-MM-DD)', example: '2026-04-06' })
  @IsDateString()
  appointmentDate: string;

  /** HH:mm, e.g. "14:00" */
  @ApiProperty({ description: 'Start time (HH:mm)', example: '10:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime: string;

  @ApiPropertyOptional({ description: 'Optional client notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

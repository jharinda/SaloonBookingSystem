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
import { WaitlistStatus } from '../schemas/waitlist.schema';

export class WaitlistServiceDto {
  @ApiProperty({ description: 'Catalog service ID' })
  @IsMongoId()
  serviceId: string;

  @ApiProperty({ description: 'Service display name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Price in smallest currency unit', minimum: 0 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Duration in minutes', minimum: 1 })
  @IsNumber()
  @Min(1)
  durationMinutes: number;
}

export class JoinWaitlistDto {
  @ApiProperty({ description: 'Salon ID' })
  @IsMongoId()
  salonId: string;

  @ApiProperty({ description: 'Appointment date (YYYY-MM-DD)', example: '2026-04-06' })
  @IsDateString()
  appointmentDate: string;

  @ApiProperty({ description: 'Preferred start time (HH:mm)', example: '10:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'preferredStartTime must be in HH:mm format' })
  preferredStartTime: string;

  @ApiProperty({ description: 'Preferred end time (HH:mm)', example: '11:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'preferredEndTime must be in HH:mm format' })
  preferredEndTime: string;

  @ApiPropertyOptional({ description: 'Specific stylist ID to wait for' })
  @IsMongoId()
  @IsOptional()
  stylistId?: string;

  @ApiProperty({ type: [WaitlistServiceDto], description: 'Requested services' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WaitlistServiceDto)
  services: WaitlistServiceDto[];
}

export class WaitlistEntryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty()
  salonId: string;

  @ApiProperty()
  appointmentDate: string;

  @ApiProperty()
  preferredStartTime: string;

  @ApiProperty()
  preferredEndTime: string;

  @ApiPropertyOptional({ nullable: true })
  stylistId: string | null;

  @ApiProperty()
  services: WaitlistServiceDto[];

  @ApiProperty({ enum: ['waiting', 'notified', 'booked', 'expired'] })
  status: WaitlistStatus;

  @ApiPropertyOptional({ nullable: true })
  notifiedAt: string | null;

  @ApiProperty()
  createdAt: string;
}

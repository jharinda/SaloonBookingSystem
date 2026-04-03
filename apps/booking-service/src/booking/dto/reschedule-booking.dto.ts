import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, Matches } from 'class-validator';

export class RescheduleBookingDto {
  @ApiProperty({ description: 'New appointment date (YYYY-MM-DD)', example: '2026-04-10' })
  @IsDateString()
  appointmentDate!: string;

  @ApiProperty({ description: 'New start time (HH:mm)', example: '14:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime!: string;
}

import { IsDateString, IsString, Matches } from 'class-validator';

export class RescheduleBookingDto {
  @IsDateString()
  appointmentDate!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime!: string;
}

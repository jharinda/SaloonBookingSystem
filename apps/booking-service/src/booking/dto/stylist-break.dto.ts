import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString, Matches } from 'class-validator';
import { BreakType } from '../schemas/stylist-break.schema';

export class CreateStylistBreakDto {
  @IsMongoId()
  salonId: string;

  @IsDateString()
  date: string;

  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @Matches(/^\d{2}:\d{2}$/)
  endTime: string;

  @IsEnum(BreakType)
  type: BreakType;

  @IsOptional()
  @IsString()
  note?: string;
}

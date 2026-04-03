import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { BookedServiceDto } from './create-booking.dto';

export class ModifyBookingDto {
  @ApiPropertyOptional({
    type: [BookedServiceDto],
    description: 'Replacement list of booked services (all services must be supplied)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookedServiceDto)
  services?: BookedServiceDto[];

  @ApiPropertyOptional({ description: 'New stylist ID (leave unset to keep current)' })
  @IsOptional()
  @IsString()
  stylistId?: string;

  @ApiPropertyOptional({ description: 'Client-visible notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

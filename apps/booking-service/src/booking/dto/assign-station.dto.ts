import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO for assigning a booking to a different station
 */
export class AssignStationDto {
  @IsString()
  @IsNotEmpty()
  stationId: string;
}

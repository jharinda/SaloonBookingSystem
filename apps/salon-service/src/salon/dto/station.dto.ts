import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for creating a new station
 */
export class CreateStationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

/**
 * DTO for updating an existing station
 */
export class UpdateStationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Response DTO for a single station
 */
export interface StationResponseDto {
  _id: string;
  name: string;
  isActive: boolean;
}

/**
 * Response DTO for listing stations
 */
export interface StationsResponseDto {
  stations: StationResponseDto[];
  stationCount: number;
}

import { IsMongoId, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReviewQueryDto {
  @IsOptional()
  @IsMongoId()
  salonId?: string;

  @IsOptional()
  @IsMongoId()
  stylistId?: string;

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

import {
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ReviewImageDto {
  @IsString()
  @IsNotEmpty()
  cloudinaryId: string;

  @IsUrl()
  url: string;
}

export class CreateReviewDto {
  @IsMongoId()
  salonId: string;

  @IsMongoId()
  bookingId: string;

  @IsOptional()
  @IsMongoId()
  stylistId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewImageDto)
  images?: ReviewImageDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cloudinaryId: string;

  @ApiProperty()
  @IsUrl()
  url: string;
}

export class CreateReviewDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  salonId: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439099' })
  @IsMongoId()
  bookingId: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  stylistIds?: string[];

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional({ type: [ReviewImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewImageDto)
  images?: ReviewImageDto[];
}

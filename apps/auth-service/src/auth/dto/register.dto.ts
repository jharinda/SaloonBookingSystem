import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@org/shared-auth';
import type { WorkingHours, PortfolioImage } from '@org/models';

export class WorkingHoursDto implements WorkingHours {
  @ApiProperty({ minimum: 0, maximum: 6 })
  @IsNumber()
  @Min(0)
  @Max(6)
  day: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  start: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  end: string;

  @ApiProperty()
  @IsBoolean()
  isOff: boolean;
}

export class PortfolioImageDto implements PortfolioImage {
  @ApiProperty()
  @IsString()
  cloudinaryId: string;

  @ApiProperty()
  @IsString()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;
}

export class StylistProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional({ type: [PortfolioImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortfolioImageDto)
  portfolioImages?: PortfolioImageDto[];

  @ApiPropertyOptional({ type: [WorkingHoursDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto[];
}

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message:
      'Password must contain at least one uppercase letter, one number, and one special character',
  })
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty({ message: 'First name must not be empty' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Last name must not be empty' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  lastName: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole, {
    message: 'Role must be one of: client, salon_owner, franchise_owner, stylist, admin',
  })
  role: UserRole;

  @ApiPropertyOptional({ type: StylistProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StylistProfileDto)
  stylistProfile?: StylistProfileDto;
}

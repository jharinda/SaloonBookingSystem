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

export enum UserRole {
  CLIENT = 'client',
  SALON_OWNER = 'salon_owner',
  FRANCHISE_OWNER = 'franchise_owner',
  STYLIST = 'stylist',
  ADMIN = 'admin',
}

export class WorkingHoursDto {
  @IsNumber()
  @Min(0)
  @Max(6)
  day: number;

  @IsString()
  start: string;

  @IsString()
  end: string;

  @IsBoolean()
  isOff: boolean;
}

export class PortfolioImageDto {
  @IsString()
  cloudinaryId: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class StylistProfileDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  yearsExperience?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortfolioImageDto)
  portfolioImages?: PortfolioImageDto[];

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

  @IsString()
  @IsNotEmpty({ message: 'First name must not be empty' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name must not be empty' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  lastName: string;

  @IsEnum(UserRole, {
    message: 'Role must be one of: client, salon_owner, franchise_owner, stylist, admin',
  })
  role: UserRole;

  @IsOptional()
  @ValidateNested()
  @Type(() => StylistProfileDto)
  stylistProfile?: StylistProfileDto;
}

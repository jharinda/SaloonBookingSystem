import { IsArray, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateStylistProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;
}

export class CreateJoinRequestDto {
  @IsMongoId()
  salonId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class InviteStylistDto {
  @IsMongoId()
  stylistId: string;

  @IsMongoId()
  salonId: string;

  @IsString()
  @MaxLength(200)
  salonName: string;
}

export class StylistJoinRequestResponseDto {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
  stylistProfile: {
    bio?: string;
    specialties: string[];
    yearsExperience: number;
    portfolioImages: Array<{
      cloudinaryId: string;
      url: string;
      caption?: string;
    }>;
    joinRequestStatus: string;
  };
  createdAt: Date;
}

export class SalonStaffResponseDto {
  _id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  stylistProfile: {
    bio?: string;
    specialties: string[];
    yearsExperience: number;
    averageRating?: number;
  };
}

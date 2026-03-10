import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateJoinRequestDto {
  @IsMongoId()
  salonId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
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

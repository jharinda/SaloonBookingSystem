import { IsString, IsNumber, IsDateString, Min, Max } from 'class-validator';

export class AddPortfolioReviewDto {
  @IsString()
  reviewId: string;

  @IsString()
  salonId: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  comment: string;

  @IsString()
  serviceName: string;

  @IsString()
  clientName: string;

  @IsDateString()
  date: Date;
}

export interface PortfolioReviewResponseDto {
  reviewId: string;
  salonId: string;
  rating: number;
  comment: string;
  serviceName: string;
  clientName: string;
  date: Date;
}

export interface StylistPortfolioResponseDto {
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
    portfolioReviews: PortfolioReviewResponseDto[];
    isAvailable: boolean;
    workingHours: Array<{
      day: number;
      start: string;
      end: string;
      isOff: boolean;
    }>;
  };
}


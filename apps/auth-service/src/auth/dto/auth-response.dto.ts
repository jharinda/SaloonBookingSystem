import { UserRole } from './register.dto';

export interface WorkingHoursResponse {
  day: number;
  start: string;
  end: string;
  isOff: boolean;
}

export interface PortfolioImageResponse {
  cloudinaryId: string;
  url: string;
  caption?: string;
}

export interface StylistProfileResponse {
  bio?: string;
  specialties: string[];
  yearsExperience: number;
  portfolioImages: PortfolioImageResponse[];
  currentSalonId?: string | null;
  joinRequestStatus: 'none' | 'pending' | 'approved' | 'rejected';
  isAvailable: boolean;
  workingHours: WorkingHoursResponse[];
}

export class TokensDto {
  accessToken: string;
  refreshToken: string;
}

export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isEmailVerified: boolean;
  phone?: string;
  avatarUrl?: string;
  createdAt: Date;
  stylistProfile?: StylistProfileResponse;
}

export class AuthResponseDto {
  user: UserResponseDto;
  accessToken: string;
  refreshToken: string;
}

export class RefreshResponseDto {
  accessToken: string;
}

import { UserRole } from '@org/shared-auth';
import type { JoinRequestStatus, WorkingHours, PortfolioImage } from '@org/models';

export interface StylistProfileResponse {
  bio?: string;
  specialties: string[];
  yearsExperience: number;
  portfolioImages: PortfolioImage[];
  currentSalonId?: string | null;
  joinRequestStatus: JoinRequestStatus;
  isAvailable: boolean;
  workingHours: WorkingHours[];
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
  /** Present when returned from internal GET /api/auth/users/:id (user-service, etc.). */
  googleId?: string | null;
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

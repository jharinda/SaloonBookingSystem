import { UserRole } from './register.dto';

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
  createdAt: Date;
}

export class AuthResponseDto {
  user: UserResponseDto;
  accessToken: string;
  refreshToken: string;
}

export class RefreshResponseDto {
  accessToken: string;
}

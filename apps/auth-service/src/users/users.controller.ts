import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto, UserProfileResponseDto } from '../auth/dto/user-profile.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string; role: string };
}

/**
 * Legacy `/api/users/*` routes still mounted on auth-service for backward compatibility.
 * Prefer routing profile flows through the API gateway to user-service.
 */
@ApiTags('auth')
@ApiBearerAuth('JWT')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  /**
   * @deprecated Prefer user-service `GET /api/users/me`. Retained for internal/legacy callers until migration completes.
   */
  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest): Promise<UserProfileResponseDto> {
    return this.authService.getProfile(req.user.sub);
  }

  /**
   * @deprecated Prefer user-service `PATCH /api/users/me`. Retained for internal/legacy callers until migration completes.
   */
  @ApiOperation({ summary: 'Update profile (legacy)' })
  @ApiResponse({ status: 200, description: 'Profile' })
  @Patch('me')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.authService.updateProfile(req.user.sub, dto);
  }

  /**
   * @deprecated Deletes the auth User only; user-service should remove the profile and coordinate cleanup.
   */
  @ApiOperation({ summary: 'Delete account (legacy)' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.authService.deleteAccount(req.user.sub);
  }
}

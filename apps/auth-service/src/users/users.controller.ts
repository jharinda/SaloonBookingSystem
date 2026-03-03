import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';

import { AuthService } from '../auth/auth.service';
import { AvatarUploadService } from '../auth/avatar-upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ConnectedAccountsResponseDto,
  NotificationPreferencesResponseDto,
  UpdateNotificationPreferencesDto,
  UpdateProfileDto,
  UserProfileResponseDto,
} from '../auth/dto/user-profile.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string; role: string };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly avatarUploadService: AvatarUploadService,
  ) {}

  /** GET /api/users/me */
  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest): Promise<UserProfileResponseDto> {
    return this.authService.getProfile(req.user.sub);
  }

  /** PATCH /api/users/me */
  @Patch('me')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.authService.updateProfile(req.user.sub, dto);
  }

  /** PATCH /api/users/me/avatar */
  @Patch('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', { storage: memoryStorage() }),
  )
  async updateAvatar(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    const avatarUrl = await this.avatarUploadService.uploadAvatar(file);
    await this.authService.updateAvatar(req.user.sub, avatarUrl);
    return { avatarUrl };
  }

  /** PATCH /api/users/me/notifications */
  @Patch('me/notifications')
  async updateNotifications(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.authService.updateNotificationPreferences(req.user.sub, dto);
  }

  /** GET /api/users/me/connected-accounts */
  @Get('me/connected-accounts')
  async getConnectedAccounts(
    @Req() req: AuthenticatedRequest,
  ): Promise<ConnectedAccountsResponseDto> {
    return this.authService.getConnectedAccounts(req.user.sub);
  }

  /** DELETE /api/users/me */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.authService.deleteAccount(req.user.sub);
  }
}

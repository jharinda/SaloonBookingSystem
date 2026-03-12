import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import {
  UpdateNotificationPreferencesDto,
  UpdateProfileDto,
  UpdateStylistProfileDto,
  UserProfileResponseDto,
  AddPortfolioImageDto,
  AddPortfolioReviewDto,
  WorkingHoursDto,
  NotificationPreferencesResponseDto,
} from './dto/user-profile.dto';
import { JwtAuthGuard, CurrentUser, JwtUser, RolesGuard, Roles, UserRole, Public } from '@org/shared-auth';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** GET /api/users/me */
  @Get('me')
  async getProfile(@CurrentUser() user: JwtUser): Promise<UserProfileResponseDto> {
    return this.userService.getProfile(user.sub);
  }

  /** PATCH /api/users/me */
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.userService.updateProfile(user.sub, dto);
  }

  /** PATCH /api/users/me/notifications */
  @Patch('me/notifications')
  async updateNotifications(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.userService.updateNotificationPreferences(user.sub, dto);
  }

  /** DELETE /api/users/me */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() user: JwtUser): Promise<void> {
    await this.userService.deleteProfile(user.sub);
  }

  // ── Stylist Profile Management ────────────────────────────────────────────

  /** PATCH /api/users/me/stylist-profile */
  @Patch('me/stylist-profile')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async updateStylistProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateStylistProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.userService.updateStylistProfile(user.sub, dto);
  }

  /** POST /api/users/me/stylist-profile/portfolio-images */
  @Post('me/stylist-profile/portfolio-images')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async addPortfolioImage(
    @CurrentUser() user: JwtUser,
    @Body() dto: AddPortfolioImageDto,
  ): Promise<UserProfileResponseDto> {
    return this.userService.addPortfolioImage(user.sub, dto);
  }

  /** DELETE /api/users/me/stylist-profile/portfolio-images/:cloudinaryId */
  @Delete('me/stylist-profile/portfolio-images/:cloudinaryId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async removePortfolioImage(
    @CurrentUser() user: JwtUser,
    @Param('cloudinaryId') cloudinaryId: string,
  ): Promise<UserProfileResponseDto> {
    return this.userService.removePortfolioImage(user.sub, cloudinaryId);
  }

  /** POST /api/users/me/stylist-profile/portfolio-reviews */
  @Post('me/stylist-profile/portfolio-reviews')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async addPortfolioReview(
    @CurrentUser() user: JwtUser,
    @Body() dto: AddPortfolioReviewDto,
  ): Promise<UserProfileResponseDto> {
    return this.userService.addPortfolioReview(user.sub, dto);
  }

  /** PATCH /api/users/me/stylist-profile/working-hours */
  @Patch('me/stylist-profile/working-hours')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async updateWorkingHours(
    @CurrentUser() user: JwtUser,
    @Body() workingHours: WorkingHoursDto[],
  ): Promise<UserProfileResponseDto> {
    return this.userService.updateWorkingHours(user.sub, workingHours);
  }

  // ── Public / Inter-Service Endpoints ──────────────────────────────────────

  /** GET /api/users/:userId/basic-info */
  @Public()
  @Get(':userId/basic-info')
  async getUserBasicInfo(@Param('userId') userId: string) {
    return this.userService.getUserBasicInfo(userId);
  }

  /** GET /api/users/email/:email */
  @Public()
  @Get('email/:email')
  async getUserByEmail(@Param('email') email: string) {
    return this.userService.getProfileByEmail(email);
  }
}

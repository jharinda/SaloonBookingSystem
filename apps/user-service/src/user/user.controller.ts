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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

@ApiTags('users')
@ApiBearerAuth('JWT')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile' })
  @Get('me')
  async getProfile(@CurrentUser() user: JwtUser): Promise<UserProfileResponseDto> {
    return this.userService.getProfile(user.sub, user);
  }

  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.userService.updateProfile(user.sub, dto);
  }

  @ApiOperation({ summary: 'Upload avatar (multipart field: avatar)' })
  @ApiResponse({ status: 200, description: 'Avatar URL' })
  @Patch('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', { storage: memoryStorage() }))
  async updateAvatar(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    return this.userService.updateAvatar(user.sub, file);
  }

  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences' })
  @Patch('me/notifications')
  async updateNotifications(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.userService.updateNotificationPreferences(user.sub, dto);
  }

  @ApiOperation({ summary: 'List connected OAuth accounts' })
  @ApiResponse({ status: 200, description: 'Connected accounts' })
  @Get('me/connected-accounts')
  async getConnectedAccounts(@CurrentUser() user: JwtUser): Promise<{ google: boolean }> {
    return this.userService.getConnectedAccounts(user.sub);
  }

  @ApiOperation({ summary: 'Delete current user account' })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() user: JwtUser): Promise<void> {
    await this.userService.deleteProfile(user.sub);
  }

  @ApiOperation({ summary: 'Update stylist profile fields' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @Patch('me/stylist-profile')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async updateStylistProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateStylistProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.userService.updateStylistProfile(user.sub, dto);
  }

  @ApiOperation({ summary: 'Add portfolio image (stylist)' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @Post('me/stylist-profile/portfolio-images')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async addPortfolioImage(
    @CurrentUser() user: JwtUser,
    @Body() dto: AddPortfolioImageDto,
  ): Promise<UserProfileResponseDto> {
    return this.userService.addPortfolioImage(user.sub, dto);
  }

  @ApiOperation({ summary: 'Remove portfolio image (stylist)' })
  @ApiParam({ name: 'cloudinaryId', description: 'Cloudinary asset id' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @Delete('me/stylist-profile/portfolio-images/:cloudinaryId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async removePortfolioImage(
    @CurrentUser() user: JwtUser,
    @Param('cloudinaryId') cloudinaryId: string,
  ): Promise<UserProfileResponseDto> {
    return this.userService.removePortfolioImage(user.sub, cloudinaryId);
  }

  @ApiOperation({ summary: 'Add portfolio review snippet (stylist)' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @Post('me/stylist-profile/portfolio-reviews')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async addPortfolioReview(
    @CurrentUser() user: JwtUser,
    @Body() dto: AddPortfolioReviewDto,
  ): Promise<UserProfileResponseDto> {
    return this.userService.addPortfolioReview(user.sub, dto);
  }

  @ApiOperation({ summary: 'Update working hours (stylist)' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @Patch('me/stylist-profile/working-hours')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STYLIST)
  async updateWorkingHours(
    @CurrentUser() user: JwtUser,
    @Body() workingHours: WorkingHoursDto[],
  ): Promise<UserProfileResponseDto> {
    return this.userService.updateWorkingHours(user.sub, workingHours);
  }

  @ApiOperation({ summary: 'Search clients (salon owner / admin)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Matching clients' })
  @Get('search/clients')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async searchClients(@Query('q') q: string) {
    return this.userService.searchClients(q);
  }

  // ── Favorites ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get saved salon IDs for current user' })
  @ApiResponse({ status: 200, description: 'List of saved salon IDs' })
  @Get('me/favorites')
  async getFavorites(@CurrentUser() user: JwtUser): Promise<string[]> {
    return this.userService.getFavorites(user.sub);
  }

  @ApiOperation({ summary: 'Save a salon to favorites' })
  @ApiParam({ name: 'salonId', description: 'Salon ID to add' })
  @ApiResponse({ status: 200, description: 'Updated favorite salon IDs' })
  @Post('me/favorites/:salonId')
  async addFavorite(
    @CurrentUser() user: JwtUser,
    @Param('salonId') salonId: string,
  ): Promise<{ favoriteSalonIds: string[] }> {
    return this.userService.addFavorite(user.sub, salonId);
  }

  @ApiOperation({ summary: 'Remove a salon from favorites' })
  @ApiParam({ name: 'salonId', description: 'Salon ID to remove' })
  @ApiResponse({ status: 200, description: 'Updated favorite salon IDs' })
  @Delete('me/favorites/:salonId')
  async removeFavorite(
    @CurrentUser() user: JwtUser,
    @Param('salonId') salonId: string,
  ): Promise<{ favoriteSalonIds: string[] }> {
    return this.userService.removeFavorite(user.sub, salonId);
  }

  @Public()
  @ApiOperation({ summary: 'Look up user by email (public)' })
  @ApiParam({ name: 'email', description: 'Email address' })
  @ApiResponse({ status: 200, description: 'Profile' })
  @Get('email/:email')
  async getUserByEmail(@Param('email') email: string) {
    return this.userService.getProfileByEmail(email);
  }

  @Public()
  @ApiOperation({ summary: 'Get basic public info for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Basic user info' })
  @Get(':userId/basic-info')
  async getUserBasicInfo(@Param('userId') userId: string) {
    return this.userService.getUserBasicInfo(userId);
  }
}

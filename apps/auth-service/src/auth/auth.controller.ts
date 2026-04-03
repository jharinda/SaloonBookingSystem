import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { IsEmail, IsEnum, IsString } from 'class-validator';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string; role: string };
}

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '@org/shared-auth';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshResponseDto, UserResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser, JwtUser } from './decorators/current-user.decorator';
import {
  CreateJoinRequestDto,
  InviteStylistDto,
  StylistJoinRequestResponseDto,
  SalonStaffResponseDto,
  UpdateStylistProfileDto,
} from './dto/stylist-join-request.dto';
import { AddPortfolioReviewDto, StylistPortfolioResponseDto } from './dto/portfolio.dto';
import { AddFcmTokenDto, RemoveFcmTokenDto, FcmTokensResponseDto } from './dto/fcm-token.dto';
import { UserDocument } from './schemas/user.schema';
import { GooglePendingProfile } from './strategies/google.strategy';
import { ConfigService } from '@nestjs/config';

class CompleteGoogleRegistrationDto {
  @IsString() pendingToken!: string;
  @IsEnum(UserRole) role!: UserRole;
}

class ResendVerificationDto {
  @IsEmail() email!: string;
}

const REFRESH_COOKIE = 'refresh_token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('auth')
@ApiBearerAuth('JWT')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Register new account' })
  @ApiResponse({ status: 201, description: 'User and access token; refresh cookie set' })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserResponseDto; accessToken: string }> {
    const { refreshToken, ...body } = await this.authService.register(dto);
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'User and access token; refresh cookie set' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserResponseDto; accessToken: string }> {
    const { refreshToken, ...body } = await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @ApiOperation({ summary: 'Refresh access token (refresh cookie)' })
  @ApiResponse({ status: 200, description: 'New access token' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request): Promise<RefreshResponseDto> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token: string | undefined = (req as any).cookies?.[REFRESH_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Refresh token missing');
    }
    return this.authService.refreshToken(token);
  }

  @ApiOperation({ summary: 'Logout (clears refresh cookie)' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const authHeader: string = (req.headers as Record<string, string>)['authorization'] ?? '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    await this.authService.logout(req.user.sub, accessToken);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto);
  }

  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 204, description: 'Password updated' })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto);
  }

  @ApiOperation({ summary: 'Verify email address' })
  @ApiQuery({ name: 'token', required: true })
  @ApiResponse({ status: 200, description: 'Verification result' })
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query('token') token: string): Promise<{ message: string }> {
    if (!token) {
      throw new UnauthorizedException('Verification token is required.');
    }
    return this.authService.verifyEmail(token);
  }

  @ApiOperation({ summary: 'Resend email verification' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
    return this.authService.resendVerification(dto.email);
  }

  // ── Internal user lookup (consumed by other microservices) ─────────────────

  @ApiExcludeEndpoint()
  @Get('users/:id')
  async getUser(
    @Param('id') id: string,
    @Headers('x-internal-token') token: string | undefined,
  ): Promise<UserResponseDto> {
    const expected = this.configService.get<string>('internalToken');
    if (!expected || !token || token !== expected) {
      throw new UnauthorizedException('Internal access only');
    }
    return this.authService.findUserById(id);
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  /** Step 1: Set intent cookie then hand off to Passport.
   *  Using a pre-route lets us record login vs register intent before Google
   *  redirects away — the Passport guard runs on the next route below. */
  @ApiOperation({ summary: 'Google OAuth: set intent cookie and redirect' })
  @ApiQuery({ name: 'intent', required: false, enum: ['login', 'register'] })
  @Get('google/init')
  googleInit(
    @Query('intent') intent = 'register',
    @Res() res: Response,
  ): void {
    res.cookie('google_intent', intent === 'login' ? 'login' : 'register', {
      httpOnly: true,
      maxAge: 5 * 60 * 1000, // 5 min — enough for the OAuth round-trip
      sameSite: 'lax',
    });
    res.redirect('/api/auth/google');
  }

  @ApiOperation({ summary: 'Google OAuth redirect to Google' })
  @Get('google')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // Passport redirects to Google — no body needed
  }

  @ApiOperation({ summary: 'Google OAuth callback (redirect)' })
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user: UserDocument | GooglePendingProfile },
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl') ?? 'http://localhost:4200';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intent: string = (req as any).cookies?.google_intent ?? 'register';
    res.clearCookie('google_intent');

    // New user — no account exists yet
    if ('pending' in req.user && req.user.pending) {
      if (intent === 'login') {
        // Login page: tell user they need to register first
        return res.redirect(`${frontendUrl}/auth/login?error=not_registered`);
      }
      // Register page: let user choose their role
      const pendingToken = this.authService.createPendingToken(req.user as GooglePendingProfile);
      return res.redirect(`${frontendUrl}/auth/google/complete?pendingToken=${pendingToken}`);
    }

    // Existing user — generate full auth tokens and log in
    const { accessToken, refreshToken } = await this.authService.generateTokens(req.user as UserDocument);
    this.setRefreshCookie(res, refreshToken);
    res.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);
  }

  @ApiOperation({ summary: 'Complete Google registration with role' })
  @ApiResponse({ status: 200, description: 'User and tokens' })
  @Post('google/complete')
  @HttpCode(HttpStatus.OK)
  async completeGoogleRegistration(
    @Body() dto: CompleteGoogleRegistrationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserResponseDto; accessToken: string }> {
    const { refreshToken, ...body } = await this.authService.completeGoogleRegistration(
      dto.pendingToken,
      dto.role,
    );
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  // ── Stylist join request endpoints ─────────────────────────────────────

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Request to join a salon (stylist)' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Post('stylist/join-request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async createJoinRequest(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateJoinRequestDto,
  ): Promise<{ message: string }> {
    return this.authService.createJoinRequest(user.sub, dto.salonId, dto.message);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'List join requests for owner salons' })
  @ApiQuery({ name: 'salonId', required: false })
  @ApiResponse({ status: 200, description: 'Join requests' })
  @Get('stylist/join-requests')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async getStylistJoinRequests(
    @CurrentUser() user: JwtUser,
    @Query('salonId') salonId?: string,
  ): Promise<StylistJoinRequestResponseDto[]> {
    return this.authService.getStylistJoinRequests(user.sub, salonId);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Approve stylist join request' })
  @ApiParam({ name: 'stylistId' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Patch('stylist/join-requests/:stylistId/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async approveJoinRequest(
    @Param('stylistId') stylistId: string,
  ): Promise<{ message: string }> {
    return this.authService.approveJoinRequest(stylistId);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Reject stylist join request' })
  @ApiParam({ name: 'stylistId' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Patch('stylist/join-requests/:stylistId/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async rejectJoinRequest(
    @Param('stylistId') stylistId: string,
  ): Promise<{ message: string }> {
    return this.authService.rejectJoinRequest(stylistId);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'List staff for a salon (public)' })
  @ApiParam({ name: 'salonId' })
  @ApiResponse({ status: 200, description: 'Staff list' })
  @Get('salons/:salonId/staff')
  @HttpCode(HttpStatus.OK)
  async getSalonStaff(
    @Param('salonId') salonId: string,
  ): Promise<SalonStaffResponseDto[]> {
    return this.authService.getSalonStaff(salonId);
  }

  // ── Salon-owner invitation endpoints ───────────────────────────────────

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Invite stylist to salon' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Post('salon/invite-stylist')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async inviteStylist(
    @CurrentUser() user: JwtUser,
    @Body() dto: InviteStylistDto,
  ): Promise<{ message: string }> {
    return this.authService.inviteStylist(user.sub, dto.stylistId, dto.salonId, dto.salonName);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Sent invitations for a salon' })
  @ApiParam({ name: 'salonId' })
  @ApiResponse({ status: 200, description: 'Invitations' })
  @Get('salon/:salonId/sent-invitations')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async getSalonSentInvitations(
    @Param('salonId') salonId: string,
  ): Promise<Array<{
    stylistId: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string;
    status: string;
    invitedAt: Date;
    respondedAt?: Date;
  }>> {
    return this.authService.getSalonSentInvitations(salonId);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Pending salon invitations for stylist' })
  @ApiResponse({ status: 200, description: 'Invitations' })
  @Get('stylist/invitations')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async getStylistInvitations(
    @CurrentUser() user: JwtUser,
  ): Promise<Array<{ salonId: string; salonName: string; status: string; invitedAt: Date }>> {
    return this.authService.getStylistInvitations(user.sub);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Accept salon invitation' })
  @ApiParam({ name: 'salonId' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Patch('stylist/invitations/:salonId/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async acceptInvitation(
    @CurrentUser() user: JwtUser,
    @Param('salonId') salonId: string,
  ): Promise<{ message: string }> {
    return this.authService.acceptInvitation(user.sub, salonId);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Reject salon invitation' })
  @ApiParam({ name: 'salonId' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Patch('stylist/invitations/:salonId/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async rejectInvitation(
    @CurrentUser() user: JwtUser,
    @Param('salonId') salonId: string,
  ): Promise<{ message: string }> {
    return this.authService.rejectInvitation(user.sub, salonId);
  }

  // ── Stylist profile update ─────────────────────────────────────────────

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Update stylist profile' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Patch('stylist/profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async updateStylistProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateStylistProfileDto,
  ): Promise<{ message: string }> {
    return this.authService.updateStylistProfile(user.sub, dto);
  }

  // ── Stylist portfolio endpoints ────────────────────────────────────────

  @ApiExcludeEndpoint()
  @Patch('users/:stylistId/portfolio-review')
  @HttpCode(HttpStatus.OK)
  async addPortfolioReview(
    @Param('stylistId') stylistId: string,
    @Body() dto: AddPortfolioReviewDto,
    @Headers('x-internal-token') token: string | undefined,
  ): Promise<{ message: string }> {
    const expected = this.configService.get<string>('internalToken');
    if (!expected || !token || token !== expected) {
      throw new UnauthorizedException('Internal access only');
    }
    return this.authService.addPortfolioReview(stylistId, dto);
  }

  @ApiTags('stylists')
  @ApiOperation({ summary: 'Get stylist portfolio (public)' })
  @ApiParam({ name: 'id', description: 'Stylist user id' })
  @ApiResponse({ status: 200, description: 'Portfolio' })
  @Get('stylists/:id/portfolio')
  @HttpCode(HttpStatus.OK)
  async getStylistPortfolio(@Param('id') id: string): Promise<StylistPortfolioResponseDto> {
    return this.authService.getStylistPortfolio(id);
  }

  // ── FCM Token Management ──────────────────────────────────────────────────

  @ApiOperation({ summary: 'Register FCM device token' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Post('fcm-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async addFcmToken(
    @Body() dto: AddFcmTokenDto,
    @CurrentUser() user: JwtUser,
  ): Promise<{ message: string }> {
    return this.authService.addFcmToken(user.sub, dto.token, dto.device);
  }

  @ApiOperation({ summary: 'Remove FCM device token' })
  @ApiResponse({ status: 200, description: 'Result message' })
  @Delete('fcm-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async removeFcmToken(
    @Body() dto: RemoveFcmTokenDto,
    @CurrentUser() user: JwtUser,
  ): Promise<{ message: string }> {
    return this.authService.removeFcmToken(user.sub, dto.token);
  }

  /**
   * Internal endpoint for notification-service to fetch user FCM tokens.
   * No JWT required — network-only access.
   */
  @ApiExcludeEndpoint()
  @Get('users/:userId/fcm-tokens')
  @HttpCode(HttpStatus.OK)
  async getFcmTokens(@Param('userId') userId: string): Promise<FcmTokensResponseDto> {
    return this.authService.getFcmTokens(userId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.configService.get<string>('app.env') === 'production',
      sameSite: 'strict',
      maxAge: SEVEN_DAYS_MS,
      path: '/api/auth',
    });
  }
}

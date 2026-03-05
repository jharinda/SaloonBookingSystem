import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { IsEnum, IsString } from 'class-validator';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string; role: string };
}

import { AuthService } from './auth.service';
import { RegisterDto, UserRole } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshResponseDto, UserResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserDocument } from './schemas/user.schema';
import { GooglePendingProfile } from './strategies/google.strategy';
import { ConfigService } from '@nestjs/config';

class CompleteGoogleRegistrationDto {
  @IsString() pendingToken!: string;
  @IsEnum(UserRole) role!: UserRole;
}

const REFRESH_COOKIE = 'refresh_token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

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

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(req.user.sub);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  // ── Internal user lookup (consumed by other microservices) ─────────────────

  @Get('users/:id')
  @UseGuards(JwtAuthGuard)
  async getUser(@Param('id') id: string): Promise<UserResponseDto> {
    return this.authService.findUserById(id);
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  /** Step 1: Set intent cookie then hand off to Passport.
   *  Using a pre-route lets us record login vs register intent before Google
   *  redirects away — the Passport guard runs on the next route below. */
  @Get('google/init')
  googleInit(
    @Query('intent') intent: string = 'register',
    @Res() res: Response,
  ): void {
    res.cookie('google_intent', intent === 'login' ? 'login' : 'register', {
      httpOnly: true,
      maxAge: 5 * 60 * 1000, // 5 min — enough for the OAuth round-trip
      sameSite: 'lax',
    });
    res.redirect('/api/auth/google');
  }

  @Get('google')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // Passport redirects to Google — no body needed
  }

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

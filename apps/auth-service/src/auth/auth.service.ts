import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { Queue } from 'bull';
import type Redis from 'ioredis';

import { User, UserDocument } from './schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto, RefreshResponseDto, UserResponseDto } from './dto/auth-response.dto';
import {
  ConnectedAccountsResponseDto,
  NotificationPreferencesResponseDto,
  UpdateNotificationPreferencesDto,
  UpdateProfileDto,
  UserProfileResponseDto,
} from './dto/user-profile.dto';
import { GooglePendingProfile } from './strategies/google.strategy';
import { UserRole } from './dto/register.dto';

export interface AdminUserDto {
  _id:       string;
  firstName: string;
  lastName:  string;
  email:     string;
  role:      string;
  isActive:  boolean;
  createdAt: Date;
}

const BCRYPT_SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const OTP_TTL_SECONDS = 15 * 60; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_TTL_SECONDS = 15 * 60; // 15 minutes
const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const NOTIFICATION_QUEUE = 'notifications';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue: Queue,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const userData: any = {
      email: dto.email.toLowerCase(),
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
    };

    // If role is stylist, create stylistProfile
    if (dto.role === UserRole.STYLIST) {
      userData.stylistProfile = {
        bio: dto.stylistProfile?.bio ?? null,
        specialties: dto.stylistProfile?.specialties ?? [],
        yearsExperience: dto.stylistProfile?.yearsExperience ?? 0,
        portfolioImages: dto.stylistProfile?.portfolioImages ?? [],
        portfolioReviews: [],
        currentSalonId: null,
        joinRequestStatus: 'none',
        isAvailable: true,
        workingHours: dto.stylistProfile?.workingHours ?? [],
      };
    }

    const user = await this.userModel.create(userData);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verifyKey = `email-verify:${verificationToken}`;
    await this.redis.setex(verifyKey, EMAIL_VERIFY_TTL_SECONDS, user.id);

    // Send verification email
    await this.notifQueue.add('send-email-verification', {
      userId: user.id,
      email: user.email,
      token: verificationToken,
    });

    const tokens = await this.generateTokens(user);

    return {
      user: this.toUserResponse(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const email = dto.email.toLowerCase();

    // Check if account is locked due to too many failed attempts
    const lockoutKey = `login-lockout:${email}`;
    const isLockedOut = await this.redis.get(lockoutKey);
    if (isLockedOut) {
      throw new UnauthorizedException(
        'Account temporarily locked. Try again in 15 minutes.',
      );
    }

    const user = await this.userModel
      .findOne({ email })
      .select('+passwordHash');

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      // Increment failed login attempts
      const attemptsKey = `login-attempts:${email}`;
      const attempts = await this.redis.incr(attemptsKey);
      await this.redis.expire(attemptsKey, LOCKOUT_TTL_SECONDS);

      // Lock account if max attempts reached
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await this.redis.setex(lockoutKey, LOCKOUT_TTL_SECONDS, '1');
        throw new UnauthorizedException(
          'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.',
        );
      }

      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in. Check your inbox for a verification link.',
      );
    }

    if (user.isActive === false) {
      throw new UnauthorizedException(
        'Your account has been suspended. Please contact support.',
      );
    }

    // Clear failed login attempts on successful login
    const attemptsKey = `login-attempts:${email}`;
    await this.redis.del(attemptsKey, lockoutKey);

    const tokens = await this.generateTokens(user);

    return {
      user: this.toUserResponse(user),
      ...tokens,
    };
  }

  async refreshToken(incomingRefreshToken: string): Promise<RefreshResponseDto> {
    let payload: { sub: string; email: string; role: string };

    try {
      payload = this.jwtService.verify(incomingRefreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userModel
      .findById(payload.sub)
      .select('+refreshToken');

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenMatches = await bcrypt.compare(
      incomingRefreshToken,
      user.refreshToken,
    );
    if (!tokenMatches) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    );

    return { accessToken };
  }

  async logout(userId: string, accessToken?: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });

    if (accessToken) {
      const decoded = this.jwtService.decode(accessToken) as { exp?: number } | null;
      if (decoded?.exp) {
        const remainingSeconds = Math.floor(decoded.exp - Date.now() / 1000);
        if (remainingSeconds > 0) {
          await this.redis.set(`blacklist:${accessToken}`, '1', 'EX', remainingSeconds);
        }
      }
    }
  }

  // ── Password reset ───────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    // Silently ignore unknown emails to prevent user enumeration
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() }).lean();
    if (!user) return;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const redisKey = `pwd-reset:${dto.email.toLowerCase()}`;

    await this.redis.set(redisKey, otp, 'EX', OTP_TTL_SECONDS);

    await this.notifQueue.add('auth.password_reset', {
      to: dto.email.toLowerCase(),
      toName: `${(user as UserDocument).firstName} ${(user as UserDocument).lastName}`,
      subject: 'Your SnapSalon password reset code',
      otp,
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const redisKey = `pwd-reset:${dto.email.toLowerCase()}`;
    const storedOtp = await this.redis.get(redisKey);

    if (!storedOtp) {
      throw new BadRequestException('OTP has expired or does not exist. Please request a new one.');
    }

    if (storedOtp !== dto.otp) {
      throw new BadRequestException('Invalid OTP. Please check the code and try again.');
    }

    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      throw new NotFoundException('No account found with this email address.');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await user.save();

    await this.redis.del(redisKey);
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const verifyKey = `email-verify:${token}`;
    const userId = await this.redis.get(verifyKey);

    if (!userId) {
      throw new BadRequestException('Invalid or expired verification token.');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.isEmailVerified) {
      return { message: 'Email is already verified.' };
    }

    user.isEmailVerified = true;
    await user.save();

    await this.redis.del(verifyKey);

    return { message: 'Email verified successfully. You can now log in.' };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new NotFoundException('No account found with this email address.');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified.');
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verifyKey = `email-verify:${verificationToken}`;
    await this.redis.setex(verifyKey, EMAIL_VERIFY_TTL_SECONDS, user.id);

    // Send verification email
    await this.notifQueue.add('send-email-verification', {
      userId: user.id,
      email: user.email,
      token: verificationToken,
    });

    return { message: 'Verification email sent. Please check your inbox.' };
  }

  // ── Public helpers (used by OAuth callback) ─────────────────────────────

  async generateTokens(
    user: UserDocument,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtPayload = { sub: user.id, email: user.email, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: ACCESS_TOKEN_EXPIRY,
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: REFRESH_TOKEN_EXPIRY,
      }),
    ]);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);
    await this.userModel.findByIdAndUpdate(user.id, {
      refreshToken: hashedRefreshToken,
    });

    return { accessToken, refreshToken };
  }

  /** Creates a short-lived (10 min) token carrying the Google profile so the
   *  frontend can resume registration after the user selects their role. */
  createPendingToken(profile: GooglePendingProfile): string {
    return this.jwtService.sign(
      {
        type: 'google_pending',
        googleId:  profile.googleId,
        email:     profile.email,
        firstName: profile.firstName,
        lastName:  profile.lastName,
        avatarUrl: profile.avatarUrl,
      },
      {
        secret:    this.configService.get<string>('jwt.accessSecret'),
        expiresIn: '10m',
      },
    );
  }

  /** Verifies the pending token and creates the user with the chosen role. */
  async completeGoogleRegistration(
    pendingToken: string,
    role: UserRole,
  ): Promise<AuthResponseDto> {
    let payload: {
      type: string;
      googleId: string;
      email: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    };

    try {
      payload = this.jwtService.verify(pendingToken, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Pending token expired or invalid. Please try again.');
    }

    if (payload.type !== 'google_pending') {
      throw new BadRequestException('Invalid token type');
    }

    // Re-check in case the user registered by email in the meantime
    const existing = await this.userModel.findOne({ email: payload.email });
    if (existing) {
      if (!existing.googleId) {
        existing.googleId = payload.googleId;
        existing.isEmailVerified = true;
        await existing.save();
      }
      if (existing.isActive === false) {
        throw new UnauthorizedException('Your account has been suspended. Please contact support.');
      }
      const tokens = await this.generateTokens(existing);
      return { user: this.toUserResponse(existing), ...tokens };
    }

    const userData: any = {
      googleId: payload.googleId,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      avatarUrl: payload.avatarUrl ?? null,
      role,
      isEmailVerified: true,
      passwordHash: null,
    };

    // If role is stylist, create default stylistProfile
    if (role === UserRole.STYLIST) {
      userData.stylistProfile = {
        bio: null,
        specialties: [],
        yearsExperience: 0,
        portfolioImages: [],
        portfolioReviews: [],
        currentSalonId: null,
        joinRequestStatus: 'none',
        isAvailable: true,
        workingHours: [],
      };
    }

    const user = await this.userModel.create(userData);

    const tokens = await this.generateTokens(user);
    return { user: this.toUserResponse(user), ...tokens };
  }

  // ── Internal user lookups (consumed by other microservices) ─────────────

  async findUserById(id: string): Promise<UserResponseDto> {
    const user = await this.userModel.findById(id).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toUserResponse(user as UserDocument);
  }

  async findUsersByIds(ids: string[]): Promise<UserResponseDto[]> {
    const users = await this.userModel.find({ _id: { $in: ids } }).lean();
    return users.map((u) => this.toUserResponse(u as UserDocument));
  }

  // ── User profile management ────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');
    return this.toProfileResponse(user as UserDocument);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileResponseDto> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone ?? null },
        { new: true },
      )
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return this.toProfileResponse(user as UserDocument);
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<UserProfileResponseDto> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { avatarUrl }, { new: true })
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return this.toProfileResponse(user as UserDocument);
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');

    const prefs = {
      email:    dto.email,
      sms:      dto.sms,
      whatsapp: dto.whatsapp,
      push:     dto.push,
    };

    await this.userModel.findByIdAndUpdate(userId, { $set: { notificationPreferences: prefs } });

    return prefs;
  }

  async getConnectedAccounts(userId: string): Promise<ConnectedAccountsResponseDto> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');
    const u = user as UserDocument;
    return u.googleId ? { google: { email: u.email } } : {};
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.userModel.findByIdAndDelete(userId);
  }

  // ── Admin methods ────────────────────────────────────────────────────────

  async adminListUsers(params: {
    page?:  number;
    limit?: number;
    role?:  string;
  }): Promise<{ data: AdminUserDto[]; total: number; page: number; limit: number }> {
    const page  = params.page  ?? 1;
    const limit = Math.min(params.limit ?? 10, 100);
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (params.role && params.role !== 'all') {
      filter['role'] = params.role;
    }

    const [users, total] = await Promise.all([
      this.userModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: users.map((u: any) => ({
        _id:       u._id?.toString(),
        firstName: u.firstName,
        lastName:  u.lastName,
        email:     u.email,
        role:      u.role,
        isActive:  u.isActive ?? true,
        createdAt: u.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  async adminSuspendUser(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    user.isActive = false;
    await user.save();
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private toProfileResponse(user: UserDocument): UserProfileResponseDto {
    const response: UserProfileResponseDto = {
      _id: (user._id ?? user.id) as string,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      role: user.role,
      createdAt:
        user.createdAt instanceof Date
          ? user.createdAt.toISOString()
          : String(user.createdAt),
    };

    if (user.role === UserRole.STYLIST && user.stylistProfile) {
      response.stylistProfile = {
        bio: user.stylistProfile.bio,
        specialties: user.stylistProfile.specialties || [],
        yearsExperience: user.stylistProfile.yearsExperience || 0,
        portfolioImages: user.stylistProfile.portfolioImages || [],
        currentSalonId: user.stylistProfile.currentSalonId?.toString() ?? null,
        joinRequestStatus: user.stylistProfile.joinRequestStatus || 'none',
        isAvailable: user.stylistProfile.isAvailable ?? true,
        workingHours: user.stylistProfile.workingHours || [],
      };
    }

    return response;
  }

  // ── Stylist join request methods ────────────────────────────────────────

  async createJoinRequest(
    userId: string,
    salonId: string,
    message?: string,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.STYLIST) {
      throw new ForbiddenException('Only stylists can request to join a salon');
    }

    if (!user.stylistProfile) {
      throw new BadRequestException('Stylist profile not found');
    }

    if (user.stylistProfile.joinRequestStatus === 'pending') {
      throw new BadRequestException(
        'You already have a pending join request. Please wait for a response.',
      );
    }

    if (
      user.stylistProfile.joinRequestStatus === 'approved' &&
      user.stylistProfile.currentSalonId
    ) {
      throw new BadRequestException(
        'You are already affiliated with a salon. Please leave your current salon first.',
      );
    }

    // Update stylist profile
    user.stylistProfile.currentSalonId = salonId as any;
    user.stylistProfile.joinRequestStatus = 'pending';
    await user.save();

    // Push notification to queue for salon owner
    await this.notifQueue.add('stylist.join_request', {
      salonId,
      stylistId: userId,
      stylistName: `${user.firstName} ${user.lastName}`,
      message: message ?? null,
    });

    return { message: 'Join request sent successfully' };
  }

  async getStylistJoinRequests(
    salonOwnerId: string,
    salonId?: string,
  ): Promise<Array<{
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
      joinRequestStatus: string;
    };
    createdAt: Date;
  }>> {
    const owner = await this.userModel.findById(salonOwnerId);
    if (!owner) {
      throw new NotFoundException('User not found');
    }

    if (owner.role !== UserRole.SALON_OWNER) {
      throw new ForbiddenException('Only salon owners can view join requests');
    }

    // Build query filter
    const filter: any = {
      role: UserRole.STYLIST,
      'stylistProfile.joinRequestStatus': 'pending',
    };

    // If salonId is provided, filter by it
    if (salonId) {
      filter['stylistProfile.currentSalonId'] = salonId;
    }

    const stylists = await this.userModel.find(filter).lean();

    return stylists.map((s: any) => ({
      _id: s._id.toString(),
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      avatarUrl: s.avatarUrl ?? undefined,
      stylistProfile: {
        bio: s.stylistProfile?.bio,
        specialties: s.stylistProfile?.specialties || [],
        yearsExperience: s.stylistProfile?.yearsExperience || 0,
        portfolioImages: s.stylistProfile?.portfolioImages || [],
        joinRequestStatus: s.stylistProfile?.joinRequestStatus || 'none',
      },
      createdAt: s.createdAt,
    }));
  }

  async approveJoinRequest(stylistId: string): Promise<{ message: string }> {
    const stylist = await this.userModel.findById(stylistId);
    if (!stylist) {
      throw new NotFoundException('Stylist not found');
    }

    if (stylist.role !== UserRole.STYLIST) {
      throw new BadRequestException('User is not a stylist');
    }

    if (!stylist.stylistProfile) {
      throw new BadRequestException('Stylist profile not found');
    }

    if (stylist.stylistProfile.joinRequestStatus !== 'pending') {
      throw new BadRequestException('No pending join request for this stylist');
    }

    stylist.stylistProfile.joinRequestStatus = 'approved';
    await stylist.save();

    // Notify stylist
    await this.notifQueue.add('stylist.join_request_approved', {
      stylistId,
      stylistEmail: stylist.email,
      stylistName: `${stylist.firstName} ${stylist.lastName}`,
    });

    return { message: 'Join request approved successfully' };
  }

  async rejectJoinRequest(stylistId: string): Promise<{ message: string }> {
    const stylist = await this.userModel.findById(stylistId);
    if (!stylist) {
      throw new NotFoundException('Stylist not found');
    }

    if (stylist.role !== UserRole.STYLIST) {
      throw new BadRequestException('User is not a stylist');
    }

    if (!stylist.stylistProfile) {
      throw new BadRequestException('Stylist profile not found');
    }

    if (stylist.stylistProfile.joinRequestStatus !== 'pending') {
      throw new BadRequestException('No pending join request for this stylist');
    }

    stylist.stylistProfile.joinRequestStatus = 'rejected';
    stylist.stylistProfile.currentSalonId = null;
    await stylist.save();

    // Notify stylist
    await this.notifQueue.add('stylist.join_request_rejected', {
      stylistId,
      stylistEmail: stylist.email,
      stylistName: `${stylist.firstName} ${stylist.lastName}`,
    });

    return { message: 'Join request rejected successfully' };
  }

  async getSalonStaff(
    salonId: string,
  ): Promise<Array<{
    _id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    stylistProfile: {
      bio?: string;
      specialties: string[];
      yearsExperience: number;
      averageRating?: number;
    };
  }>> {
    const stylists = await this.userModel
      .find({
        role: UserRole.STYLIST,
        'stylistProfile.joinRequestStatus': 'approved',
        'stylistProfile.currentSalonId': salonId,
      } as any)
      .lean();

    return stylists.map((s: any) => ({
      _id: s._id.toString(),
      firstName: s.firstName,
      lastName: s.lastName,
      avatarUrl: s.avatarUrl ?? undefined,
      stylistProfile: {
        bio: s.stylistProfile?.bio,
        specialties: s.stylistProfile?.specialties || [],
        yearsExperience: s.stylistProfile?.yearsExperience || 0,
        // TODO: Calculate average rating from reviews service
        averageRating: undefined,
      },
    }));
  }

  // ── Stylist portfolio methods ───────────────────────────────────────────

  async addPortfolioReview(
    stylistId: string,
    portfolioData: {
      reviewId: string;
      salonId: string;
      rating: number;
      comment: string;
      serviceName: string;
      clientName: string;
      date: Date;
    },
  ): Promise<{ message: string }> {
    const stylist = await this.userModel.findById(stylistId);
    if (!stylist) {
      throw new NotFoundException('Stylist not found');
    }

    if (stylist.role !== UserRole.STYLIST) {
      throw new BadRequestException('User is not a stylist');
    }

    if (!stylist.stylistProfile) {
      throw new BadRequestException('Stylist profile not found');
    }

    // Initialize portfolioReviews if it doesn't exist
    if (!stylist.stylistProfile.portfolioReviews) {
      stylist.stylistProfile.portfolioReviews = [];
    }

    // Check if review already exists
    const existingReviewIndex = stylist.stylistProfile.portfolioReviews.findIndex(
      (pr: any) => pr.reviewId === portfolioData.reviewId,
    );

    if (existingReviewIndex >= 0) {
      // Update existing review
      stylist.stylistProfile.portfolioReviews[existingReviewIndex] = portfolioData;
    } else {
      // Add new review
      stylist.stylistProfile.portfolioReviews.push(portfolioData);
    }

    await stylist.save();

    return { message: 'Portfolio review added successfully' };
  }

  async getStylistPortfolio(
    stylistId: string,
  ): Promise<{
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
      portfolioReviews: Array<{
        reviewId: string;
        salonId: string;
        rating: number;
        comment: string;
        serviceName: string;
        clientName: string;
        date: Date;
      }>;
      isAvailable: boolean;
      workingHours: Array<{
        day: number;
        start: string;
        end: string;
        isOff: boolean;
      }>;
    };
  }> {
    const stylist = await this.userModel.findById(stylistId).lean();
    if (!stylist) {
      throw new NotFoundException('Stylist not found');
    }

    const s = stylist as any;

    if (s.role !== UserRole.STYLIST) {
      throw new BadRequestException('User is not a stylist');
    }

    if (!s.stylistProfile) {
      throw new BadRequestException('Stylist profile not found');
    }

    // Sort portfolio reviews by date descending
    const portfolioReviews = (s.stylistProfile.portfolioReviews || []).sort(
      (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return {
      _id: s._id.toString(),
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      avatarUrl: s.avatarUrl ?? undefined,
      stylistProfile: {
        bio: s.stylistProfile.bio,
        specialties: s.stylistProfile.specialties || [],
        yearsExperience: s.stylistProfile.yearsExperience || 0,
        portfolioImages: s.stylistProfile.portfolioImages || [],
        portfolioReviews,
        isAvailable: s.stylistProfile.isAvailable ?? true,
        workingHours: s.stylistProfile.workingHours || [],
      },
    };
  }

  // ── FCM Token Management ──────────────────────────────────────────────────

  /**
   * Add or update FCM token for a user.
   * Removes duplicate tokens from other users (token can only belong to one user).
   * Limits to 5 tokens per user (removes oldest when adding 6th).
   */
  async addFcmToken(
    userId: string,
    token: string,
    device: string,
  ): Promise<{ message: string }> {
    // Remove this token from all other users first
    await this.userModel.updateMany(
      { _id: { $ne: userId }, 'fcmTokens.token': token },
      { $pull: { fcmTokens: { token } } },
    );

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if token already exists for this user
    const existingTokenIndex = user.fcmTokens.findIndex((t) => t.token === token);

    if (existingTokenIndex !== -1) {
      // Update createdAt for existing token
      user.fcmTokens[existingTokenIndex].createdAt = new Date();
    } else {
      // Add new token
      user.fcmTokens.push({
        token,
        device,
        createdAt: new Date(),
      });

      // Keep only the 5 most recent tokens
      if (user.fcmTokens.length > 5) {
        // Sort by createdAt descending, then keep first 5
        user.fcmTokens.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        user.fcmTokens = user.fcmTokens.slice(0, 5);
      }
    }

    await user.save();
    return { message: 'FCM token added successfully' };
  }

  /**
   * Remove FCM token from a user (called on logout).
   */
  async removeFcmToken(userId: string, token: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.fcmTokens = user.fcmTokens.filter((t) => t.token !== token);
    await user.save();

    return { message: 'FCM token removed successfully' };
  }

  /**
   * Get all FCM tokens for a user (internal endpoint for notification-service).
   */
  async getFcmTokens(userId: string): Promise<{
    userId: string;
    tokens: Array<{ token: string; device: string; createdAt: Date }>;
  }> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      userId: user._id.toString(),
      tokens: user.fcmTokens || [],
    };
  }

  private toUserResponse(user: UserDocument): UserResponseDto {
    const response: UserResponseDto = {
      id: (user._id ?? user.id) as string,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      phone: user.phone ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      createdAt: user.createdAt,
    };

    if (user.role === UserRole.STYLIST && user.stylistProfile) {
      response.stylistProfile = {
        bio: user.stylistProfile.bio,
        specialties: user.stylistProfile.specialties || [],
        yearsExperience: user.stylistProfile.yearsExperience || 0,
        portfolioImages: user.stylistProfile.portfolioImages || [],
        currentSalonId: user.stylistProfile.currentSalonId?.toString() ?? null,
        joinRequestStatus: user.stylistProfile.joinRequestStatus || 'none',
        isAvailable: user.stylistProfile.isAvailable ?? true,
        workingHours: user.stylistProfile.workingHours || [],
      };
    }

    return response;
  }
}

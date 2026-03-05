import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserDocument } from './schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.userModel.create({
      ...dto,
      email: dto.email.toLowerCase(),
      passwordHash,
    });

    const tokens = await this.generateTokens(user);

    return {
      user: this.toUserResponse(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {

    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+passwordHash');

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException(
        'Your account has been suspended. Please contact support.',
      );
    }

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

  async logout(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
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

    const user = await this.userModel.create({
      googleId:        payload.googleId,
      email:           payload.email,
      firstName:       payload.firstName,
      lastName:        payload.lastName,
      avatarUrl:       payload.avatarUrl ?? null,
      role,
      isEmailVerified: true,
      passwordHash:    null,
    });

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
    return {
      _id:       (user._id ?? user.id) as string,
      email:     user.email,
      firstName: user.firstName,
      lastName:  user.lastName,
      phone:     user.phone ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      role:      user.role,
      createdAt: user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : String(user.createdAt),
    };
  }

  private toUserResponse(user: UserDocument): UserResponseDto {
    return {
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
  }
}

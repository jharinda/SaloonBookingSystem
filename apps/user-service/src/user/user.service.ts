import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { JwtUser } from '@org/shared-auth';
import { FILE_UPLOAD_SERVICE, FileUploadService } from './interfaces/file-upload.interface';
import {
  UserProfile,
  UserProfileDocument,
} from './schemas/user-profile.schema';
import {
  CreateUserProfileDto,
  UpdateNotificationPreferencesDto,
  UpdateProfileDto,
  UpdateStylistProfileDto,
  UserProfileResponseDto,
  AddPortfolioImageDto,
  AddPortfolioReviewDto,
  WorkingHoursDto,
  NotificationPreferencesResponseDto,
} from './dto/user-profile.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(UserProfile.name)
    private readonly userProfileModel: Model<UserProfileDocument>,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @Inject(FILE_UPLOAD_SERVICE) private readonly uploadService: FileUploadService,
  ) {}

  /**
   * Create a new user profile (called from Bull queue on user.created event)
   */
  async createUserProfile(dto: CreateUserProfileDto): Promise<UserProfileDocument> {
    const existing = await this.userProfileModel.findOne({ userId: dto.userId });
    if (existing) {
      this.logger.warn(`User profile already exists for userId: ${dto.userId}`);
      return existing;
    }

    const userProfile = new this.userProfileModel(dto);
    await userProfile.save();
    this.logger.log(`Created user profile for userId: ${dto.userId}`);
    return userProfile;
  }

  /**
   * Get user profile by userId (from JWT).
   *
   * If the profile doesn't exist yet (e.g. the user.created queue event hasn't
   * been processed yet for a freshly registered account), a stub profile is
   * created from the JWT claims so the caller never receives a 404.  The stub
   * will be enriched by the user.created processor once it runs.
   */
  async getProfile(userId: string, jwtUser?: JwtUser): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileModel.findOne({ userId }).lean().exec();
    if (profile) {
      return this.toResponseDto(profile);
    }

    if (!jwtUser) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    this.logger.warn(
      `Profile missing for userId ${userId} — creating stub from JWT claims`,
    );

    // Derive a reasonable name from the email local-part so we can satisfy
    // the schema's required fields.  The user.created queue event will
    // overwrite these with the real names once it is processed.
    const localPart = jwtUser.email.split('@')[0] ?? 'User';
    const nameParts = localPart.split(/[._-]/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.length > 1 ? nameParts[1] : 'User';

    const stub = new this.userProfileModel({
      userId,
      email: jwtUser.email,
      firstName,
      lastName,
      role: jwtUser.role,
    });
    await stub.save();
    return this.toResponseDto(stub.toObject());
  }

  /**
   * Get user profile by internal _id
   */
  async getProfileById(id: string): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileModel.findById(id).lean().exec();
    if (!profile) {
      throw new NotFoundException(`User profile not found with id: ${id}`);
    }
    return this.toResponseDto(profile);
  }

  /**
   * Get user profile by email
   */
  async getProfileByEmail(email: string): Promise<UserProfileResponseDto | null> {
    const profile = await this.userProfileModel.findOne({ email }).lean().exec();
    return profile ? this.toResponseDto(profile) : null;
  }

  /**
   * Update basic profile information
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $set: dto },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return this.toResponseDto(profile);
  }

  /**
   * Upload a new avatar for the user, deleting the old one from Cloudinary first.
   * Returns the new public URL.
   */
  async updateAvatar(userId: string, file: Express.Multer.File): Promise<{ avatarUrl: string }> {
    const existing = await this.userProfileModel.findOne({ userId }).lean().exec();

    if (existing?.avatarUrl) {
      await this.uploadService.delete(existing.avatarUrl);
    }

    const avatarUrl = await this.uploadService.upload(file);

    await this.userProfileModel
      .findOneAndUpdate({ userId }, { $set: { avatarUrl } })
      .exec();

    return { avatarUrl };
  }

  /**
   * Set avatar URL from sync events (no Cloudinary upload).
   */
  async setAvatarUrl(userId: string, avatarUrl: string): Promise<void> {
    await this.userProfileModel
      .findOneAndUpdate({ userId }, { $set: { avatarUrl } })
      .exec();
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    // Build dot-notation $set so only the provided fields are updated,
    // leaving the other preferences intact.
    const updateFields: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(dto) as [string, boolean][]) {
      if (val !== undefined) {
        updateFields[`notificationPreferences.${key}`] = val;
      }
    }

    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $set: updateFields },
        { new: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return profile.notificationPreferences;
  }

  /**
   * Whether the auth user has Google linked (googleId on auth User model).
   */
  async getConnectedAccounts(userId: string): Promise<{ google: boolean }> {
    const token = this.configService.get<string>('internalToken');
    const authUrl = this.configService.get<string>('services.authUrl', 'http://localhost:3003');
    if (!token) {
      this.logger.warn(
        'INTERNAL_TOKEN not set — cannot resolve connected accounts from auth-service',
      );
      return { google: false };
    }
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{ googleId?: string | null }>(
          `${authUrl}/api/auth/users/${encodeURIComponent(userId)}`,
          { headers: { 'x-internal-token': token } },
        ),
      );
      return { google: !!data?.googleId };
    } catch (err) {
      this.logger.warn(
        `getConnectedAccounts failed for ${userId}: ${(err as Error).message}`,
      );
      return { google: false };
    }
  }

  /**
   * Update stylist profile
   */
  async updateStylistProfile(
    userId: string,
    dto: UpdateStylistProfileDto,
  ): Promise<UserProfileResponseDto> {
    // Ensure stylistProfile is initialised (MongoDB can't $set nested
    // dot-notation fields on a null parent object).
    await this.userProfileModel.updateOne(
      { userId, stylistProfile: null },
      {
        $set: {
          stylistProfile: {
            bio: '',
            specialties: [],
            yearsExperience: 0,
            portfolioImages: [],
            portfolioReviews: [],
            currentSalonId: null,
            joinRequestStatus: 'none',
            isAvailable: true,
            workingHours: [],
          },
        },
      },
    );

    const updateFields: Record<string, unknown> = {};

    if (dto.bio !== undefined) updateFields['stylistProfile.bio'] = dto.bio;
    if (dto.specialties !== undefined) updateFields['stylistProfile.specialties'] = dto.specialties;
    if (dto.yearsExperience !== undefined) updateFields['stylistProfile.yearsExperience'] = dto.yearsExperience;
    if (dto.isAvailable !== undefined) updateFields['stylistProfile.isAvailable'] = dto.isAvailable;

    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $set: updateFields },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return this.toResponseDto(profile);
  }

  /**
   * Add portfolio image
   */
  async addPortfolioImage(
    userId: string,
    dto: AddPortfolioImageDto,
  ): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $push: { 'stylistProfile.portfolioImages': dto } },
        { new: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return this.toResponseDto(profile);
  }

  /**
   * Remove portfolio image
   */
  async removePortfolioImage(
    userId: string,
    cloudinaryId: string,
  ): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $pull: { 'stylistProfile.portfolioImages': { cloudinaryId } } },
        { new: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return this.toResponseDto(profile);
  }

  /**
   * Add portfolio review
   */
  async addPortfolioReview(
    userId: string,
    dto: AddPortfolioReviewDto,
  ): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $push: { 'stylistProfile.portfolioReviews': dto } },
        { new: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return this.toResponseDto(profile);
  }

  /**
   * Update working hours
   */
  async updateWorkingHours(
    userId: string,
    workingHours: WorkingHoursDto[],
  ): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $set: { 'stylistProfile.workingHours': workingHours } },
        { new: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return this.toResponseDto(profile);
  }

  /**
   * Search client profiles by name, email, or phone (for salon-owner manual booking).
   * Returns up to 10 matching clients.
   */
  async searchClients(
    query: string,
  ): Promise<Array<{ userId: string; firstName: string; lastName: string; email: string; phone: string | null; avatarUrl: string | null }>> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const profiles = await this.userProfileModel
      .find({
        role: 'client',
        $or: [
          { firstName: regex },
          { lastName: regex },
          { email: regex },
          { phone: regex },
        ],
      })
      .select('userId firstName lastName email phone avatarUrl')
      .limit(10)
      .lean()
      .exec();

    return profiles.map((p) => ({
      userId: p.userId,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone || null,
      avatarUrl: p.avatarUrl || null,
    }));
  }

  // ── Favorites ────────────────────────────────────────────────────────────

  async addFavorite(userId: string, salonId: string): Promise<{ favoriteSalonIds: string[] }> {
    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $addToSet: { favoriteSalonIds: salonId } },
        { new: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return { favoriteSalonIds: profile.favoriteSalonIds ?? [] };
  }

  async removeFavorite(userId: string, salonId: string): Promise<{ favoriteSalonIds: string[] }> {
    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $pull: { favoriteSalonIds: salonId } },
        { new: true },
      )
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return { favoriteSalonIds: profile.favoriteSalonIds ?? [] };
  }

  async getFavorites(userId: string): Promise<string[]> {
    const profile = await this.userProfileModel
      .findOne({ userId })
      .select('favoriteSalonIds')
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }

    return profile.favoriteSalonIds ?? [];
  }

  /**
   * Delete user profile
   */
  async deleteProfile(userId: string): Promise<void> {
    await this.userProfileModel.findOneAndDelete({ userId }).exec();
  }

  /**
   * Get basic user info for external services (e.g., booking-service, chat-service)
   */
  async getUserBasicInfo(userId: string): Promise<{ firstName: string; lastName: string; email: string; avatarUrl: string | null }> {
    const profile = await this.userProfileModel
      .findOne({ userId })
      .select('firstName lastName email avatarUrl')
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      avatarUrl: profile.avatarUrl || null,
    };
  }

  /**
   * Check subscription status for a salon via subscription-service.
   * Returns subscription data or throws if salon has no active subscription.
   */
  async checkSubscription(salonId: string): Promise<unknown> {
    const url = this.configService.get('SUBSCRIPTION_SERVICE_URL');
    const res = await firstValueFrom(
      this.httpService.get(`${url}/subscriptions/${salonId}`)
    );
    return res.data;
  }

  private toResponseDto(profile: UserProfileDocument | (Document & UserProfile)): UserProfileResponseDto {
    return {
      _id: profile._id.toString(),
      userId: profile.userId,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl,
      role: profile.role,
      timezone: profile.timezone,
      currency: profile.currency ?? 'LKR',
      address: profile.address,
      notificationPreferences: profile.notificationPreferences,
      stylistProfile: profile.stylistProfile ? {
        ...profile.stylistProfile,
        currentSalonId: profile.stylistProfile.currentSalonId?.toString(),
      } : undefined,
      createdAt: profile.createdAt?.toISOString(),
      updatedAt: profile.updatedAt?.toISOString(),
    };
  }
}

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
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
} from './dto/user-profile.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(UserProfile.name)
    private readonly userProfileModel: Model<UserProfileDocument>,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
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
   * Get user profile by userId (from JWT)
   */
  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileModel.findOne({ userId }).lean().exec();
    if (!profile) {
      throw new NotFoundException(`User profile not found for userId: ${userId}`);
    }
    return this.toResponseDto(profile);
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
   * Update avatar URL
   */
  async updateAvatar(userId: string, avatarUrl: string): Promise<void> {
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
  ): Promise<UpdateNotificationPreferencesDto> {
    const profile = await this.userProfileModel
      .findOneAndUpdate(
        { userId },
        { $set: { notificationPreferences: dto } },
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
   * Update stylist profile
   */
  async updateStylistProfile(
    userId: string,
    dto: UpdateStylistProfileDto,
  ): Promise<UserProfileResponseDto> {
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

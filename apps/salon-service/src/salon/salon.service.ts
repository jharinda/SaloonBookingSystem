import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Model, Types } from 'mongoose';
import { firstValueFrom, timeout } from 'rxjs';
import type Redis from 'ioredis';
import { SubscriptionCheckService } from '@org/subscription-check';

import { Salon, SalonDocument } from './schemas/salon.schema';
import { CreateSalonDto, OperatingHoursDto } from './dto/create-salon.dto';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { AddServiceDto } from './dto/add-service.dto';
import { PaginationQueryDto, SalonSearchQueryDto, SearchSalonsDto } from './dto/salon-query.dto';
import {
  PaginatedSalonsDto,
  SalonResponseDto,
  SalonSearchResultDto,
  SalonServiceItemDto,
} from './dto/salon-response.dto';
import {
  StaffAnalyticsItemDto,
  StaffAnalyticsResponseDto,
  TopServiceDto,
  AppointmentByMonthDto,
} from './dto/staff-analytics.dto';
import { UploadService } from '../upload/upload.service';

export interface AdminSalonDto {
  _id:              string;
  name:             string;
  ownerName:        string;
  ownerEmail:       string;
  city:             string;
  submittedAt:      string;
  isApproved:       boolean;
  isActive:         boolean;
  rating:           number;
  subscriptionPlan?: string;
}

@Injectable()
export class SalonService {
  private readonly logger = new Logger(SalonService.name);

  constructor(
    @InjectModel(Salon.name) private readonly salonModel: Model<SalonDocument>,
    private readonly uploadService: UploadService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly subscriptionCheck: SubscriptionCheckService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async createSalon(
    dto: CreateSalonDto,
    ownerId: string,
    ownerEmail = '',
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.create({
      ...dto,
      ownerId: new Types.ObjectId(ownerId),
      ownerEmail,
      franchiseId: dto.franchiseId
        ? new Types.ObjectId(dto.franchiseId)
        : null,
      isApproved: false,
      location: {
        type: 'Point',
        coordinates: [dto.address.lng, dto.address.lat],
      },
      stations: [{ name: 'Station 1', isActive: true }],
    });

    return this.toResponse(salon);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedSalonsDto> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const filter = { isApproved: true };

    const [data, total] = await Promise.all([
      this.salonModel.find(filter).skip(skip).limit(limit).lean().exec(),
      this.salonModel.countDocuments(filter),
    ]);

    return {
      data: data.map((s) => this.toResponse(s as unknown as SalonDocument)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(id).lean().exec();
    if (!salon) {
      throw new NotFoundException(`Salon with id ${id} not found`);
    }
    return this.toResponse(salon as unknown as SalonDocument);
  }

  async findNearby(
    lat: number,
    lng: number,
    radiusKm = 10,
  ): Promise<SalonResponseDto[]> {
    const salons = await this.salonModel
      .find({
        isApproved: true,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: radiusKm * 1000, // convert km → metres
          },
        },
      })
      .lean()
      .exec();

    return salons.map((s) => this.toResponse(s as unknown as SalonDocument));
  }

  async findByService(serviceName: string): Promise<SalonResponseDto[]> {
    const salons = await this.salonModel
      .find({
        isApproved: true,
        $text: { $search: serviceName },
      })
      .sort({ score: { $meta: 'textScore' } })
      .lean()
      .exec();

    return salons.map((s) => this.toResponse(s as unknown as SalonDocument));
  }

  async search(query: SalonSearchQueryDto): Promise<SalonResponseDto[]> {
    const { lat, lng, service, radiusKm = 10 } = query;
    const hasGeo = lat !== undefined && lng !== undefined;

    if (hasGeo && service) {
      const salons = await this.salonModel
        .find({
          isApproved: true,
          location: {
            $near: {
              $geometry: { type: 'Point', coordinates: [lng, lat] },
              $maxDistance: radiusKm * 1000,
            },
          },
          'services.name': { $regex: service, $options: 'i' },
        })
        .lean()
        .exec();

      return salons.map((s) => this.toResponse(s as unknown as SalonDocument));
    }

    if (hasGeo) {
      return this.findNearby(lat as number, lng as number, radiusKm);
    }

    if (service) {
      return this.findByService(service);
    }

    const salons = await this.salonModel
      .find({ isApproved: true })
      .limit(50)
      .lean()
      .exec();

    return salons.map((s) => this.toResponse(s as unknown as SalonDocument));
  }

  async updateSalon(
    id: string,
    dto: UpdateSalonDto,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(id);
    if (!salon) {
      throw new NotFoundException(`Salon with id ${id} not found`);
    }
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('You can only update your own salon');
    }

    const updatePayload: Record<string, unknown> = { ...dto };
    if (dto.address) {
      updatePayload['location'] = {
        type: 'Point',
        coordinates: [dto.address.lng, dto.address.lat],
      };
    }

    const updated = await this.salonModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { returnDocument: 'after' })
      .lean()
      .exec();

    return this.toResponse(updated as unknown as SalonDocument);
  }

  async approveSalon(id: string): Promise<SalonResponseDto> {
    const salon = await this.salonModel
      .findByIdAndUpdate(
        id,
        { isApproved: true, isActive: true, subscriptionStatus: 'trial', rejectionReason: null },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!salon) {
      throw new NotFoundException(`Salon with id ${id} not found`);
    }

    return this.toResponse(salon as unknown as SalonDocument);
  }

  async rejectSalon(id: string, reason: string): Promise<SalonResponseDto> {
    const salon = await this.salonModel
      .findByIdAndUpdate(
        id,
        { isApproved: false, isActive: false, rejectionReason: reason },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!salon) {
      throw new NotFoundException(`Salon with id ${id} not found`);
    }

    return this.toResponse(salon as unknown as SalonDocument);
  }

  async addService(
    salonId: string,
    dto: AddServiceDto,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId);
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('You can only modify your own salon');
    }

    const updated = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        {
          $push: {
            services: {
              _id:             new Types.ObjectId(),
              name:            dto.name,
              description:     dto.description,
              price:           dto.price,
              durationMinutes: dto.duration,
              category:        dto.category,
              active:          dto.active ?? true,
            },
          },
        },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    return this.toResponse(updated as unknown as SalonDocument);
  }

  async updateService(
    salonId: string,
    serviceId: string,
    dto: Partial<AddServiceDto>,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId);
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('You can only modify your own salon');
    }

    const setFields: Record<string, unknown> = {};
    if (dto.name        !== undefined) setFields['services.$.name']            = dto.name;
    if (dto.description !== undefined) setFields['services.$.description']     = dto.description;
    if (dto.price       !== undefined) setFields['services.$.price']           = dto.price;
    if (dto.duration    !== undefined) setFields['services.$.durationMinutes'] = dto.duration;
    if (dto.category    !== undefined) setFields['services.$.category']        = dto.category;
    if (dto.active      !== undefined) setFields['services.$.active']          = dto.active;

    const updated = await this.salonModel
      .findOneAndUpdate(
        { _id: salonId, 'services._id': new Types.ObjectId(serviceId) },
        { $set: setFields },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException(`Service ${serviceId} not found in salon ${salonId}`);
    }

    return this.toResponse(updated as unknown as SalonDocument);
  }

  async removeService(
    salonId: string,
    serviceId: string,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId);
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('You can only modify your own salon');
    }

    const updated = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        { $pull: { services: { _id: new Types.ObjectId(serviceId) } } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    return this.toResponse(updated as unknown as SalonDocument);
  }

  async updateOperatingHours(
    salonId: string,
    hours: OperatingHoursDto[],
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId);
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('You can only modify your own salon');
    }

    const updated = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        { $set: { operatingHours: hours } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    return this.toResponse(updated as unknown as SalonDocument);
  }

  /**
   * Internal — called by review-service after each new review to keep the
   * salon's aggregate rating and review count in sync.
   */
  async updateRating(salonId: string, rating: number, reviewCount: number): Promise<void> {
    await this.salonModel.findByIdAndUpdate(
      salonId,
      { $set: { rating, reviewCount } },
    );
  }

  // ── Image management ─────────────────────────────────────────────────────

  /**
   * $push a new image entry into the salon's images array.
   * The owner check is performed here so the controller stays thin.
   */
  async pushImage(
    salonId: string,
    imageData: { cloudinaryId: string; url: string },
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId);
    if (!salon) throw new NotFoundException(`Salon ${salonId} not found`);
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('You can only modify your own salon');
    }

    const updated = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        { $push: { images: { cloudinaryId: imageData.cloudinaryId, url: imageData.url, isPrimary: false } } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    return this.toResponse(updated as unknown as SalonDocument);
  }

  /**
   * $pull an image by its `cloudinaryId` from the salon's images array
   * and permanently delete it from Cloudinary.
   */
  async removeImage(
    salonId: string,
    cloudinaryId: string,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId);
    if (!salon) throw new NotFoundException(`Salon ${salonId} not found`);
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('You can only modify your own salon');
    }

    // Verify the image belongs to this salon before touching Cloudinary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = (salon.images as unknown as any[]).some(
      (img) => img.cloudinaryId === cloudinaryId,
    );
    if (!exists) {
      throw new NotFoundException(`Image "${cloudinaryId}" not found on salon ${salonId}`);
    }

    const updated = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        { $pull: { images: { cloudinaryId } } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    // Delete the asset from Cloudinary — best-effort so a Cloudinary hiccup
    // doesn't roll back a successful DB removal from the client's perspective.
    try {
      await this.uploadService.deleteImage(cloudinaryId);
    } catch (err) {
      this.logger.warn(
        `DB record removed but Cloudinary deletion failed for "${cloudinaryId}": ${
          (err as Error).message
        }`,
      );
    }

    return this.toResponse(updated as unknown as SalonDocument);
  }

  /**
   * Set one image as primary and unset all others.
   * `imageId` may be the MongoDB subdoc `_id` OR the `cloudinaryId`.
   */
  async setPrimaryImage(
    salonId: string,
    imageId: string,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId);
    if (!salon) throw new NotFoundException(`Salon ${salonId} not found`);
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('You can only modify your own salon');
    }

    // Unset all isPrimary flags, then set the chosen one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const images: any[] = salon.images as unknown as any[];
    const target = images.find(
      (img) => img._id?.toString() === imageId || img.cloudinaryId === imageId,
    );
    if (!target) throw new NotFoundException(`Image ${imageId} not found on salon ${salonId}`);

    // Use positional operator via two sequential updates
    await this.salonModel.updateOne(
      { _id: salonId },
      { $set: { 'images.$[].isPrimary': false } },
    );
    await this.salonModel.updateOne(
      { _id: salonId, 'images.cloudinaryId': target.cloudinaryId },
      { $set: { 'images.$.isPrimary': true } },
    );

    const updated = await this.salonModel.findById(salonId).lean().exec();
    return this.toResponse(updated as unknown as SalonDocument);
  }

  async searchSalons(dto: SearchSalonsDto): Promise<SalonSearchResultDto> {
    const {
      lat,
      lng,
      radiusKm = 10,
      service,
      city,
      sortBy = 'distance',
      page = 1,
      limit = 10,
    } = dto;

    const hasGeo = lat !== undefined && lng !== undefined;
    const skip = (page - 1) * limit;

    // Base filter — always applied
    const baseFilter: Record<string, unknown> = {
      isApproved: true,
      isActive: true,
    };

    if (service) {
      baseFilter['services.name'] = { $regex: service, $options: 'i' };
    }
    if (city) {
      baseFilter['address.city'] = { $regex: `^${city}$`, $options: 'i' };
    }

    // ── Geospatial path ────────────────────────────────────────────────────
    if (hasGeo && sortBy === 'distance') {
      // $nearSphere sorts by proximity; $geoWithin used for the count
      const geoFilter: Record<string, unknown> = {
        ...baseFilter,
        location: {
          $nearSphere: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: radiusKm * 1000,
          },
        },
      };

      // Count via $geoWithin (compatible with countDocuments)
      const countFilter: Record<string, unknown> = {
        ...baseFilter,
        location: {
          $geoWithin: {
            $centerSphere: [[lng, lat], radiusKm / 6371],
          },
        },
      };

      const [salons, total] = await Promise.all([
        this.salonModel.find(geoFilter).skip(skip).limit(limit).lean().exec(),
        this.salonModel.countDocuments(countFilter),
      ]);

      return {
        salons: salons.map((s) => this.toResponse(s as unknown as SalonDocument)),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    }

    if (hasGeo && sortBy === 'rating') {
      const filter: Record<string, unknown> = {
        ...baseFilter,
        location: {
          $geoWithin: {
            $centerSphere: [[lng, lat], radiusKm / 6371],
          },
        },
      };

      const [salons, total] = await Promise.all([
        this.salonModel
          .find(filter)
          .sort({ rating: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        this.salonModel.countDocuments(filter),
      ]);

      return {
        salons: salons.map((s) => this.toResponse(s as unknown as SalonDocument)),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    }

    // ── Non-geo path ──────────────────────────────────────────────────────
    const sort: Record<string, 1 | -1> = sortBy === 'rating' ? { rating: -1 } : { createdAt: -1 };

    const [salons, total] = await Promise.all([
      this.salonModel.find(baseFilter).sort(sort).skip(skip).limit(limit).lean().exec(),
      this.salonModel.countDocuments(baseFilter),
    ]);

    return {
      salons: salons.map((s) => this.toResponse(s as unknown as SalonDocument)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getFeaturedSalons(): Promise<SalonResponseDto[]> {
    const salons = await this.salonModel
      .find({ isApproved: true, isActive: true })
      .sort({ rating: -1 })
      .limit(6)
      .lean()
      .exec();

    return salons.map((s) => this.toResponse(s as unknown as SalonDocument));
  }

  async getSalonsByOwner(ownerId: string): Promise<SalonResponseDto[]> {
    const salons = await this.salonModel
      .find({ ownerId: new Types.ObjectId(ownerId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return salons.map((s) => this.toResponse(s as unknown as SalonDocument));
  }

  /** Find salons that have a given stylist in their staff array */
  async findSalonsByStylist(stylistId: string): Promise<Array<{ salonId: string; salonName: string }>> {
    const salons = await this.salonModel
      .find({ staff: new Types.ObjectId(stylistId) })
      .select('_id name')
      .lean()
      .exec();

    return salons.map((s) => ({
      salonId: (s._id as Types.ObjectId).toString(),
      salonName: (s as any).name,
    }));
  }

  async addStaff(
    salonId: string,
    stylistId: string,
  ): Promise<SalonResponseDto> {
    // Get current salon to check staff count
    const currentSalon = await this.salonModel.findById(salonId).lean().exec();
    if (!currentSalon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }

    // Check subscription limits
    const limits = await this.subscriptionCheck.getPlanLimits(salonId);
    const currentStaffCount = (currentSalon.staff ?? []).length;

    // -1 means unlimited
    if (limits.maxStaff !== -1 && currentStaffCount >= limits.maxStaff) {
      throw new ForbiddenException(
        `Your ${limits.plan} plan allows a maximum of ${limits.maxStaff} staff members. Please upgrade to add more staff.`,
      );
    }

    const salon = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        { $addToSet: { staff: new Types.ObjectId(stylistId) } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }

    return this.toResponse(salon as unknown as SalonDocument);
  }

  /**
   * Add staff — called from controller with ownership check.
   */
  async addStaffByOwner(
    salonId: string,
    stylistId: string,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId).lean().exec();
    if (!salon) throw new NotFoundException(`Salon with id ${salonId} not found`);
    if (salon.ownerId?.toString() !== ownerId) {
      throw new ForbiddenException('You do not own this salon');
    }
    return this.addStaff(salonId, stylistId);
  }

  /**
   * Remove a staff member from the salon's staff array.
   */
  async removeStaff(
    salonId: string,
    stylistId: string,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const existing = await this.salonModel.findById(salonId).lean().exec();
    if (!existing) throw new NotFoundException(`Salon with id ${salonId} not found`);
    if (existing.ownerId?.toString() !== ownerId) {
      throw new ForbiddenException('You do not own this salon');
    }

    const salon = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        { $pull: { staff: new Types.ObjectId(stylistId) } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!salon) throw new NotFoundException(`Salon with id ${salonId} not found`);
    return this.toResponse(salon as unknown as SalonDocument);
  }

  // ── Admin methods ────────────────────────────────────────────────────────

  async adminGetStats(): Promise<{ totalSalons: number; pendingApproval: number; activeSalons: number }> {
    const [totalSalons, pendingApproval, activeSalons] = await Promise.all([
      this.salonModel.countDocuments({}),
      this.salonModel.countDocuments({ isApproved: false }),
      this.salonModel.countDocuments({ isApproved: true, isActive: true }),
    ]);
    return { totalSalons, pendingApproval, activeSalons };
  }

  async adminFindAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<{ data: AdminSalonDto[]; total: number; page: number; limit: number }> {
    const page  = params.page  ?? 1;
    const limit = Math.min(params.limit ?? 10, 100);
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (params.status === 'pending') {
      filter['isApproved'] = false;
    } else if (params.status === 'active') {
      filter['isApproved'] = true;
      filter['isActive']   = true;
    } else if (params.status === 'suspended') {
      filter['isActive'] = false;
    }

    if (params.search) {
      filter['$or'] = [
        { name:           { $regex: params.search, $options: 'i' } },
        { 'address.city': { $regex: params.search, $options: 'i' } },
        { email:          { $regex: params.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.salonModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.salonModel.countDocuments(filter),
    ]);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data.map((s: any): AdminSalonDto => ({
        _id:              s._id?.toString(),
        name:             s.name,
        ownerName:        (s as any).ownerEmail || s.email || '',
        ownerEmail:       (s as any).ownerEmail || s.email || '',
        city:             s.address?.city ?? '',
        submittedAt:      s.createdAt?.toISOString?.() ?? String(s.createdAt),
        isApproved:       s.isApproved,
        isActive:         s.isActive ?? true,
        rating:           s.rating ?? 0,
        subscriptionPlan: s.subscriptionStatus,
      })),
      total,
      page,
      limit,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponse(salon: any): SalonResponseDto {
    return {
      id: (salon._id ?? salon.id)?.toString(),
      name: salon.name,
      description: salon.description,
      phone: salon.phone,
      email: salon.email,
      ownerId: salon.ownerId?.toString(),
      franchiseId: salon.franchiseId?.toString() ?? undefined,
      address: salon.address,
      operatingHours: salon.operatingHours ?? [],
      services: (salon.services ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (svc: any): SalonServiceItemDto => ({
          id:       svc._id?.toString(),
          name:     svc.name,
          description: svc.description,
          price:    svc.price,
          duration: svc.durationMinutes,
          category: svc.category,
          active:   svc.active ?? true,
        }),
      ),
      staff: (salon.staff ?? []).map((id: Types.ObjectId) => id.toString()),
      images: salon.images ?? [],
      stations: (salon.stations ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (st: any) => ({
          _id: st._id?.toString(),
          name: st.name,
          isActive: st.isActive ?? true,
        }),
      ),
      stationCount: salon.stations?.filter((s: any) => s.isActive).length ?? 0,
      isApproved: salon.isApproved,
      isActive: salon.isActive ?? true,
      rejectionReason: salon.rejectionReason ?? undefined,
      subscriptionStatus: salon.subscriptionStatus ?? 'trial',
      rating: salon.rating,
      reviewCount: salon.reviewCount,
      cancellationWindowHours: salon.cancellationWindowHours ?? 2,
      autoConfirmBookings: salon.autoConfirmBookings ?? false,
      breakLimits: salon.breakLimits ?? { LUNCH: 1, COFFEE: 1, PERSONAL: 1, OTHER: 1 },
      createdAt: salon.createdAt,
      updatedAt: salon.updatedAt,
    };
  }

  // ── Staff Analytics ────────────────────────────────────────────────────────

  async getStaffAnalytics(
    salonId: string,
    userId: string,
  ): Promise<StaffAnalyticsResponseDto> {
    // Verify ownership or admin
    const salon = await this.salonModel.findById(salonId).lean().exec();
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }

    // Check cache first
    const cacheKey = `staff-analytics:${salonId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log(`Returning cached staff analytics for salon ${salonId}`);
        return JSON.parse(cached);
      }
    } catch (err) {
      this.logger.warn(`Redis cache read failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Fetch approved stylists from auth-service
    const authServiceUrl = this.config.get<string>('services.authUrl', 'http://localhost:3003');
    const internalToken = this.config.get<string>('internalToken', '');

    let staffMembers: Array<{ _id: string; firstName: string; lastName: string; avatarUrl?: string }> = [];
    try {
      const { data } = await firstValueFrom(
        this.httpService
          .get(`${authServiceUrl}/api/auth/salons/${salonId}/staff`, {
            headers: { 'x-internal-token': internalToken },
            timeout: 10000,
          })
          .pipe(timeout(10000)),
      );
      staffMembers = data;
    } catch (err) {
      this.logger.error(
        `Failed to fetch staff from auth-service: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new NotFoundException('Unable to fetch staff members');
    }

    if (staffMembers.length === 0) {
      const result: StaffAnalyticsResponseDto = {
        salonId,
        staff: [],
        generatedAt: new Date(),
      };
      return result;
    }

    const stylistIds = staffMembers.map((s) => s._id);

    // Fetch bookings and reviews in parallel
    const bookingServiceUrl = this.config.get<string>('services.bookingUrl', 'http://localhost:3002');
    const reviewServiceUrl = this.config.get<string>('services.reviewUrl', 'http://localhost:3005');

    const [bookingsResult, reviewsResult] = await Promise.allSettled([
      firstValueFrom(
        this.httpService
          .get(`${bookingServiceUrl}/api/bookings`, {
            params: { salonId },
            headers: { 'x-internal-token': internalToken },
            timeout: 10000,
          })
          .pipe(timeout(10000)),
      ),
      firstValueFrom(
        this.httpService
          .get(`${reviewServiceUrl}/api/reviews`, {
            params: { salonId, limit: 1000 },
            headers: { 'x-internal-token': internalToken },
            timeout: 10000,
          })
          .pipe(timeout(10000)),
      ),
    ]);

    const bookings: any[] =
      bookingsResult.status === 'fulfilled' ? bookingsResult.value.data.data || bookingsResult.value.data : [];
    const reviews: any[] =
      reviewsResult.status === 'fulfilled' ? reviewsResult.value.data.data || reviewsResult.value.data : [];

    // Aggregate data by stylist
    const analyticsMap = new Map<string, StaffAnalyticsItemDto>();

    // Initialize analytics for each stylist
    for (const staff of staffMembers) {
      analyticsMap.set(staff._id, {
        stylistId: staff._id,
        name: `${staff.firstName} ${staff.lastName}`,
        avatarUrl: staff.avatarUrl,
        totalAppointments: 0,
        completedAppointments: 0,
        cancellationRate: 0,
        averageRating: 0,
        totalReviews: 0,
        revenueGenerated: 0,
        topServices: [],
        appointmentsByMonth: [],
      });
    }

    // Process bookings
    const serviceCounter = new Map<string, Map<string, number>>(); // stylistId -> serviceName -> count
    const monthCounter = new Map<string, Map<string, number>>(); // stylistId -> month -> count
    const cancelledCounter = new Map<string, number>();

    for (const booking of bookings) {
      const stylistId = booking.stylistId || booking.staffId;
      if (!stylistId || !analyticsMap.has(stylistId)) continue;

      const analytics = analyticsMap.get(stylistId)!;
      analytics.totalAppointments++;

      if (booking.status === 'COMPLETED') {
        analytics.completedAppointments++;
        analytics.revenueGenerated += booking.totalPrice || 0;

        // Track services
        if (booking.serviceName || booking.service) {
          const serviceName = booking.serviceName || booking.service;
          if (!serviceCounter.has(stylistId)) {
            serviceCounter.set(stylistId, new Map());
          }
          const svcMap = serviceCounter.get(stylistId)!;
          svcMap.set(serviceName, (svcMap.get(serviceName) || 0) + 1);
        }

        // Track by month
        if (booking.appointmentDate || booking.date) {
          const date = new Date(booking.appointmentDate || booking.date);
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (!monthCounter.has(stylistId)) {
            monthCounter.set(stylistId, new Map());
          }
          const monthMap = monthCounter.get(stylistId)!;
          monthMap.set(month, (monthMap.get(month) || 0) + 1);
        }
      }

      if (booking.status === 'CANCELLED') {
        cancelledCounter.set(stylistId, (cancelledCounter.get(stylistId) || 0) + 1);
      }
    }

    // Calculate top services and appointments by month
    for (const [stylistId, analytics] of analyticsMap) {
      // Cancellation rate
      const cancelled = cancelledCounter.get(stylistId) || 0;
      if (analytics.totalAppointments > 0) {
        analytics.cancellationRate = Math.round((cancelled / analytics.totalAppointments) * 100 * 10) / 10;
      }

      // Top services
      if (serviceCounter.has(stylistId)) {
        const services = Array.from(serviceCounter.get(stylistId)!.entries())
          .map(([serviceName, count]) => ({ serviceName, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        analytics.topServices = services;
      }

      // Appointments by month (last 6 months)
      if (monthCounter.has(stylistId)) {
        const months = Array.from(monthCounter.get(stylistId)!.entries())
          .map(([month, count]) => ({ month, count }))
          .sort((a, b) => b.month.localeCompare(a.month))
          .slice(0, 6);
        analytics.appointmentsByMonth = months;
      }
    }

    // Process reviews
    const reviewCounter = new Map<string, { total: number; sum: number }>();
    for (const review of reviews) {
      const stylistIds = review.stylistIds || (review.stylistId ? [review.stylistId] : []);
      for (const stylistId of stylistIds) {
        if (!analyticsMap.has(stylistId)) continue;

        if (!reviewCounter.has(stylistId)) {
          reviewCounter.set(stylistId, { total: 0, sum: 0 });
        }
        const counter = reviewCounter.get(stylistId)!;
        counter.total++;
        counter.sum += review.rating || 0;
      }
    }

    // Calculate average ratings
    for (const [stylistId, analytics] of analyticsMap) {
      if (reviewCounter.has(stylistId)) {
        const { total, sum } = reviewCounter.get(stylistId)!;
        analytics.totalReviews = total;
        analytics.averageRating = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
      }
    }

    const result: StaffAnalyticsResponseDto = {
      salonId,
      staff: Array.from(analyticsMap.values()),
      generatedAt: new Date(),
    };

    // Cache for 5 minutes
    try {
      await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    } catch (err) {
      this.logger.warn(`Redis cache write failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return result;
  }

  // ── Station Management ─────────────────────────────────────────────────────
  // NOTE: Station count limits per subscription plan will be enforced
  //       in the SubscriptionGuard — see feature flag: max_stations

  /**
   * Get all active stations for a salon
   */
  async getStations(salonId: string): Promise<{ stations: Array<{ _id: string; name: string; isActive: boolean }>; stationCount: number }> {
    const salon = await this.salonModel.findById(salonId).lean().exec();
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }

    const allStations = salon.stations ?? [];
    const activeCount = (allStations as any[]).filter((s: any) => s.isActive).length;
    return {
      stations: (allStations as any[]).map((st: any) => ({
        _id: st._id?.toString(),
        name: st.name,
        isActive: st.isActive ?? true,
      })),
      stationCount: activeCount,
    };
  }

  /**
   * Add a new station to a salon (salon owner only)
   */
  async addStation(
    salonId: string,
    name: string,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId).exec();
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }

    // Verify ownership
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('Only the salon owner can add stations');
    }

    // Check subscription limits — only active stations count against the cap;
    // inactive stations are soft-disabled and should not consume quota.
    const limits = await this.subscriptionCheck.getPlanLimits(salonId);
    const activeStationCount = (salon.stations ?? []).filter((s: any) => s.isActive).length;

    // -1 means unlimited
    if (limits.maxStations !== -1 && activeStationCount >= limits.maxStations) {
      throw new ForbiddenException(
        `Your ${limits.plan} plan allows a maximum of ${limits.maxStations} active stations. Please upgrade to add more stations.`,
      );
    }

    salon.stations.push({ name, isActive: true } as any);
    await salon.save();

    return this.toResponse(salon);
  }

  /**
   * Update a station's name or active status (salon owner only)
   */
  async updateStation(
    salonId: string,
    stationId: string,
    updates: { name?: string; isActive?: boolean },
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId).exec();
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }

    // Verify ownership
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('Only the salon owner can update stations');
    }

    const station = salon.stations.find((s: any) => s._id?.toString() === stationId);
    if (!station) {
      throw new NotFoundException(`Station with id ${stationId} not found`);
    }

    if (updates.name !== undefined) {
      (station as any).name = updates.name;
    }
    if (updates.isActive !== undefined) {
      (station as any).isActive = updates.isActive;
    }

    await salon.save();
    return this.toResponse(salon);
  }

  /**
   * Soft-delete a station by setting isActive to false (salon owner only)
   */
  async deleteStation(
    salonId: string,
    stationId: string,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.findById(salonId).exec();
    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }

    // Verify ownership
    if (salon.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('Only the salon owner can delete stations');
    }

    const station = salon.stations.find((s: any) => s._id?.toString() === stationId);
    if (!station) {
      throw new NotFoundException(`Station with id ${stationId} not found`);
    }

    (station as any).isActive = false;
    await salon.save();

    return this.toResponse(salon);
  }
}

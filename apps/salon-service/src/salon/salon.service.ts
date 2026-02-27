import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

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

@Injectable()
export class SalonService {
  constructor(
    @InjectModel(Salon.name) private readonly salonModel: Model<SalonDocument>,
  ) {}

  async createSalon(
    dto: CreateSalonDto,
    ownerId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel.create({
      ...dto,
      ownerId: new Types.ObjectId(ownerId),
      franchiseId: dto.franchiseId
        ? new Types.ObjectId(dto.franchiseId)
        : null,
      isApproved: false,
      location: {
        type: 'Point',
        coordinates: [dto.address.lng, dto.address.lat],
      },
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
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .lean()
      .exec();

    return this.toResponse(updated as unknown as SalonDocument);
  }

  async approveSalon(id: string): Promise<SalonResponseDto> {
    const salon = await this.salonModel
      .findByIdAndUpdate(
        id,
        { isApproved: true, isActive: true, subscriptionStatus: 'trial', rejectionReason: null },
        { new: true },
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
        { new: true },
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
        { $push: { services: { ...dto, _id: new Types.ObjectId() } } },
        { new: true },
      )
      .lean()
      .exec();

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
        { new: true },
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
        { new: true },
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
        { new: true },
      )
      .lean()
      .exec();

    return this.toResponse(updated as unknown as SalonDocument);
  }

  /**
   * $pull an image by its `cloudinaryId` from the salon's images array.
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

    const updated = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        { $pull: { images: { cloudinaryId } } },
        { new: true },
      )
      .lean()
      .exec();

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

  async addStaff(
    salonId: string,
    stylistId: string,
  ): Promise<SalonResponseDto> {
    const salon = await this.salonModel
      .findByIdAndUpdate(
        salonId,
        { $addToSet: { staff: new Types.ObjectId(stylistId) } },
        { new: true },
      )
      .lean()
      .exec();

    if (!salon) {
      throw new NotFoundException(`Salon with id ${salonId} not found`);
    }

    return this.toResponse(salon as unknown as SalonDocument);
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
          id: svc._id?.toString(),
          name: svc.name,
          description: svc.description,
          price: svc.price,
          durationMinutes: svc.durationMinutes,
          category: svc.category,
        }),
      ),
      staff: (salon.staff ?? []).map((id: Types.ObjectId) => id.toString()),
      images: salon.images ?? [],
      isApproved: salon.isApproved,
      isActive: salon.isActive ?? true,
      rejectionReason: salon.rejectionReason ?? undefined,
      subscriptionStatus: salon.subscriptionStatus ?? 'trial',
      rating: salon.rating,
      reviewCount: salon.reviewCount,
      createdAt: salon.createdAt,
      updatedAt: salon.updatedAt,
    };
  }
}

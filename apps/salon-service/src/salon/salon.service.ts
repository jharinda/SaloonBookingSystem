import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Salon, SalonDocument } from './schemas/salon.schema';
import { CreateSalonDto } from './dto/create-salon.dto';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { PaginationQueryDto, SalonSearchQueryDto } from './dto/salon-query.dto';
import {
  PaginatedSalonsDto,
  SalonResponseDto,
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
      .findByIdAndUpdate(id, { isApproved: true }, { new: true })
      .lean()
      .exec();

    if (!salon) {
      throw new NotFoundException(`Salon with id ${id} not found`);
    }

    return this.toResponse(salon as unknown as SalonDocument);
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
      rating: salon.rating,
      reviewCount: salon.reviewCount,
      createdAt: salon.createdAt,
      updatedAt: salon.updatedAt,
    };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@org/shared-auth';

import { StylistBreak, StylistBreakDocument } from './schemas/stylist-break.schema';
import { Booking, BookingDocument } from './schemas/booking.schema';
import { BookingStatus } from '@org/models';
import { CreateStylistBreakDto } from './dto/stylist-break.dto';

/** Minimal salon shape returned by salon-service */
interface SalonInfo {
  operatingHours: Array<{
    day: number;
    open: string;
    close: string;
    closed: boolean;
  }>;
  breakLimits?: {
    LUNCH: number;
    COFFEE: number;
    PERSONAL: number;
    OTHER: number;
  };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

@Injectable()
export class StylistBreakService {
  private readonly logger = new Logger(StylistBreakService.name);

  constructor(
    @InjectModel(StylistBreak.name)
    private readonly breakModel: Model<StylistBreakDocument>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async findByDate(stylistId: string, date: string) {
    if (!date) return [];

    const breaks = await this.breakModel
      .find({
        stylistId: new Types.ObjectId(stylistId),
        date: new Date(`${date}T00:00:00.000Z`),
      })
      .lean()
      .exec();

    return breaks.map((b) => ({
      _id: b._id.toString(),
      stylistId: b.stylistId.toString(),
      salonId: b.salonId.toString(),
      date: (b.date as Date).toISOString().substring(0, 10),
      startTime: b.startTime,
      endTime: b.endTime,
      type: b.type,
      note: b.note,
    }));
  }

  /** Find all breaks for a salon on a given date (all stylists) */
  async findBySalonAndDate(salonId: string, date: string) {
    if (!date) return [];

    const breaks = await this.breakModel
      .find({
        salonId: new Types.ObjectId(salonId),
        date: new Date(`${date}T00:00:00.000Z`),
      })
      .lean()
      .exec();

    return breaks.map((b) => ({
      _id: b._id.toString(),
      stylistId: b.stylistId.toString(),
      salonId: b.salonId.toString(),
      date: (b.date as Date).toISOString().substring(0, 10),
      startTime: b.startTime,
      endTime: b.endTime,
      type: b.type,
      note: b.note,
    }));
  }

  /**
   * Returns the distinct stylist IDs who are unavailable for the given salon/date.
   *
   * When `time` and `durationMinutes` are provided, only returns stylists who
   * are unavailable at that specific slot — either because:
   *   - they have a break that overlaps [time, time+duration), OR
   *   - they already have a confirmed booking that overlaps [time, time+duration).
   *
   * Used by the booking wizard (step 3) to disable unavailable stylists.
   */
  async getStylistIdsOnBreak(
    salonId: string,
    date: string,
    time?: string,
    durationMinutes?: number,
  ): Promise<{ stylistIds: string[] }> {
    if (!date) return { stylistIds: [] };

    const unavailable = new Set<string>();

    // ── Breaks ────────────────────────────────────────────────────────────────
    const breaks = await this.breakModel
      .find({
        salonId: new Types.ObjectId(salonId),
        date: new Date(`${date}T00:00:00.000Z`),
      })
      .lean()
      .exec();

    let filteredBreaks = breaks;
    if (time && durationMinutes) {
      const slotStart = toMinutes(time);
      const slotEnd   = slotStart + durationMinutes;
      filteredBreaks = breaks.filter((b) => {
        const brStart = toMinutes(b.startTime);
        const brEnd   = toMinutes(b.endTime);
        return slotStart < brEnd && slotEnd > brStart;
      });
    }
    for (const b of filteredBreaks) {
      unavailable.add(b.stylistId.toString());
    }

    // ── Existing bookings (only when a specific time slot is provided) ─────
    if (time && durationMinutes) {
      const slotStart = toMinutes(time);
      const slotEnd   = slotStart + durationMinutes;

      const bookings = await this.bookingModel
        .find({
          salonId: new Types.ObjectId(salonId),
          appointmentDate: {
            $gte: new Date(`${date}T00:00:00.000Z`),
            $lte: new Date(`${date}T23:59:59.999Z`),
          },
          status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          stylistId: { $exists: true, $ne: null },
        })
        .lean()
        .exec();

      for (const b of bookings) {
        if (!b.stylistId) continue;
        const bStart = toMinutes(b.startTime);
        const bEnd   = toMinutes(b.endTime);
        if (slotStart < bEnd && slotEnd > bStart) {
          unavailable.add(b.stylistId.toString());
        }
      }
    }

    return { stylistIds: [...unavailable] };
  }

  async create(stylistId: string, dto: CreateStylistBreakDto) {
    // Validate time range
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    // ── Step 1: Fetch salon info (operating hours + break limit) ─────────
    const salonServiceUrl = this.configService.get<string>(
      'services.salonUrl',
      'http://salon-service:3001',
    );

    let salonInfo: SalonInfo;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<SalonInfo>(`${salonServiceUrl}/api/salons/${dto.salonId}`),
      );
      salonInfo = data;
    } catch {
      throw new BadRequestException('Could not retrieve salon information');
    }

    // ── Step 2: Validate break is within salon operating hours ──────────
    const dayOfWeek = new Date(`${dto.date}T12:00:00.000Z`).getUTCDay();
    const dayHours = salonInfo.operatingHours?.find((h) => h.day === dayOfWeek);

    if (!dayHours || dayHours.closed) {
      throw new BadRequestException('The salon is not open on this day');
    }

    const salonOpen = toMinutes(dayHours.open);
    const salonClose = toMinutes(dayHours.close);
    const breakStart = toMinutes(dto.startTime);
    const breakEnd = toMinutes(dto.endTime);

    if (breakStart < salonOpen) {
      throw new BadRequestException(
        `Break cannot start before salon opens at ${dayHours.open}`,
      );
    }

    if (breakEnd > salonClose) {
      throw new BadRequestException(
        `Break cannot end after salon closes at ${dayHours.close}`,
      );
    }

    // ── Step 3: Check per-type break limit ────────────────────────────────
    const defaultLimits = { LUNCH: 1, COFFEE: 1, PERSONAL: 1, OTHER: 1 };
    const limits = { ...defaultLimits, ...(salonInfo.breakLimits ?? {}) };
    const limitForType = limits[dto.type as keyof typeof limits] ?? 1;

    const existingTypeCount = await this.breakModel.countDocuments({
      stylistId: new Types.ObjectId(stylistId),
      date: new Date(`${dto.date}T00:00:00.000Z`),
      type: dto.type,
    });

    if (existingTypeCount >= limitForType) {
      const typeLabel = dto.type.charAt(0) + dto.type.slice(1).toLowerCase();
      throw new BadRequestException(
        `You have reached the maximum allowed ${typeLabel} breaks per day (${limitForType}) for this salon`,
      );
    }

    // ── Step 4: Check for overlapping breaks ────────────────────────────
    const existingBreaks = await this.breakModel.find({
      stylistId: new Types.ObjectId(stylistId),
      date: new Date(`${dto.date}T00:00:00.000Z`),
      $or: [
        { startTime: { $lt: dto.endTime }, endTime: { $gt: dto.startTime } },
      ],
    });

    if (existingBreaks.length > 0) {
      throw new BadRequestException('Break overlaps with an existing break');
    }

    // ── Step 5: Check for conflicting bookings ───────────────────────────
    const appointmentDate = new Date(`${dto.date}T00:00:00.000Z`);

    const conflictingBooking = await this.bookingModel.findOne({
      stylistId: new Types.ObjectId(stylistId),
      appointmentDate: {
        $gte: new Date(`${dto.date}T00:00:00.000Z`),
        $lte: new Date(`${dto.date}T23:59:59.999Z`),
      },
      status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
      startTime: { $lt: dto.endTime },
      endTime: { $gt: dto.startTime },
    });

    if (conflictingBooking) {
      throw new BadRequestException(
        `You have an existing booking from ${conflictingBooking.startTime} to ${conflictingBooking.endTime} that conflicts with this break`,
      );
    }

    // ── Step 6: Create the break ─────────────────────────────────────────
    const doc = await this.breakModel.create({
      stylistId: new Types.ObjectId(stylistId),
      salonId: new Types.ObjectId(dto.salonId),
      date: appointmentDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      type: dto.type,
      note: dto.note || '',
    });

    this.logger.log(
      `Created ${dto.type} break for stylist ${stylistId} on ${dto.date} ${dto.startTime}-${dto.endTime}`,
    );

    // Invalidate slot cache so clients see updated availability immediately
    await this.invalidateSlotCache(dto.salonId, dto.date);

    return {
      _id: doc._id.toString(),
      stylistId: doc.stylistId.toString(),
      salonId: doc.salonId.toString(),
      date: dto.date,
      startTime: doc.startTime,
      endTime: doc.endTime,
      type: doc.type,
      note: doc.note,
    };
  }

  async delete(stylistId: string, breakId: string) {
    const doc = await this.breakModel.findById(breakId);
    if (!doc) {
      throw new NotFoundException('Break not found');
    }
    if (doc.stylistId.toString() !== stylistId) {
      throw new ForbiddenException('You can only delete your own breaks');
    }

    // Capture metadata before deletion for cache invalidation
    const salonId = doc.salonId.toString();
    const date = (doc.date as Date).toISOString().substring(0, 10);

    await this.breakModel.deleteOne({ _id: breakId });
    this.logger.log(`Deleted break ${breakId} for stylist ${stylistId}`);

    // Invalidate slot cache so clients see updated availability immediately
    await this.invalidateSlotCache(salonId, date);

    return { message: 'Break deleted' };
  }

  private async invalidateSlotCache(salonId: string, date: string): Promise<void> {
    try {
      const pattern = `slots:${salonId}:${date}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(
          `Invalidated ${keys.length} slot cache key(s) for salon ${salonId} on ${date}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate slot cache for salon ${salonId} on ${date}: ${(err as Error).message}`,
      );
    }
  }
}

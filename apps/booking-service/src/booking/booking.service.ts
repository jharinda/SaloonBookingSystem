import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Model, Types } from 'mongoose';
import { Queue } from 'bull';
import Redis from 'ioredis';

import { Booking, BookingDocument, BookingStatus } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingListQueryDto } from './dto/booking-query.dto';
import {
  AvailableSlotsResponseDto,
  BookingResponseDto,
  PaginatedBookingsDto,
} from './dto/booking-response.dto';
import { BOOKING_QUEUE, BookingEvent } from './constants/booking-events.constants';

const SLOT_INTERVAL_MINUTES = 30;
const BOOKING_BUFFER_MINUTES = 15;
const CACHE_TTL_SECONDS = 60;

/** Shape of the operatingHours entry returned by salon-service */
interface SalonOperatingHours {
  day: number;    // 0 = Sunday … 6 = Saturday
  open: string;   // "HH:mm"
  close: string;  // "HH:mm"
  closed: boolean;
}

/** Minimal shape of the salon-service GET /api/salons/:id response */
interface SalonResponse {
  operatingHours: SalonOperatingHours[];
}

/** Convert "HH:mm" to total minutes since midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert total minutes since midnight back to "HH:mm" */
function toTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Add `durationMinutes` to a "HH:mm" string */
function addMinutes(time: string, duration: number): string {
  return toTimeString(toMinutes(time) + duration);
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectQueue(BOOKING_QUEUE)
    private readonly bookingQueue: Queue,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  // ── Availability ─────────────────────────────────────────────────────────

  async getAvailableSlots(
    salonId: string,
    stylistId: string | null,
    date: string,
    durationMinutes: number,
  ): Promise<AvailableSlotsResponseDto> {
    // ── Step 0: Redis cache ──────────────────────────────────────────────
    const cacheKey = `slots:${salonId}:${date}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as AvailableSlotsResponseDto;
      }
    } catch (err) {
      this.logger.warn(`Redis cache read failed: ${(err as Error).message}`);
    }

    // ── Step 1: Fetch salon operating hours from salon-service ───────────
    const salonServiceUrl = this.configService.get<string>(
      'services.salonUrl',
      'http://salon-service:3001',
    );

    let salon: SalonResponse;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<SalonResponse>(
          `${salonServiceUrl}/api/salons/${salonId}`,
        ),
      );
      salon = data;
    } catch (err) {
      this.logger.error(
        `Failed to fetch salon ${salonId} from salon-service: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        `Could not retrieve operating hours for salon ${salonId}`,
      );
    }

    // Find the operating hours entry for the given day of week.
    // Use noon UTC to avoid date-boundary issues with timezone offsets.
    const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const hours = salon.operatingHours?.find((h) => h.day === dayOfWeek);

    if (!hours || hours.closed) {
      const result: AvailableSlotsResponseDto = { salonId, date, slots: [] };
      await this.cacheResult(cacheKey, result);
      return result;
    }

    // ── Step 2: Generate all possible 30-minute-interval slots ───────────
    const openMin = toMinutes(hours.open);
    const closeMin = toMinutes(hours.close);
    const allSlots: string[] = [];

    for (
      let slot = openMin;
      slot + durationMinutes <= closeMin;
      slot += SLOT_INTERVAL_MINUTES
    ) {
      allSlots.push(toTimeString(slot));
    }

    // ── Step 3: Query existing bookings ──────────────────────────────────
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd   = new Date(`${date}T23:59:59.999Z`);

    const bookingQuery: Record<string, unknown> = {
      salonId: new Types.ObjectId(salonId),
      appointmentDate: { $gte: dayStart, $lte: dayEnd },
      status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
    };

    if (stylistId) {
      bookingQuery['stylistId'] = new Types.ObjectId(stylistId);
    }

    const existingBookings = await this.bookingModel
      .find(bookingQuery)
      .lean()
      .exec();

    // ── Step 4: Build blocked ranges (endTime + 15 min buffer) ───────────
    const blocked = existingBookings.map((b) => ({
      start: toMinutes(b.startTime),
      end:   toMinutes(b.endTime) + BOOKING_BUFFER_MINUTES,
    }));

    // ── Step 5: Filter slots that overlap any blocked range ───────────────
    const available = allSlots.filter((slot) => {
      const slotStart = toMinutes(slot);
      const slotEnd   = slotStart + durationMinutes;
      return !blocked.some((b) => slotStart < b.end && slotEnd > b.start);
    });

    const result: AvailableSlotsResponseDto = { salonId, date, slots: available };
    await this.cacheResult(cacheKey, result);
    return result;
  }

  private async cacheResult(key: string, value: unknown): Promise<void> {
    try {
      await this.redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(value));
    } catch (err) {
      this.logger.warn(`Redis cache write failed: ${(err as Error).message}`);
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async createBooking(
    dto: CreateBookingDto,
    clientId: string,
  ): Promise<BookingResponseDto> {
    const totalDuration = dto.services.reduce(
      (acc, s) => acc + s.durationMinutes,
      0,
    );
    const endTime = addMinutes(dto.startTime, totalDuration);
    const totalPrice = dto.services.reduce((acc, s) => acc + s.price, 0);

    // Validate the slot is still free
    const appointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);
    const clash = await this.bookingModel.findOne({
      salonId: new Types.ObjectId(dto.salonId),
      appointmentDate,
      status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
      $or: [
        {
          // New booking starts during an existing one
          startTime: { $lt: endTime },
          endTime: { $gt: dto.startTime },
        },
      ],
    });

    if (clash) {
      throw new BadRequestException(
        `The time slot ${dto.startTime}–${endTime} is no longer available`,
      );
    }

    const booking = await this.bookingModel.create({
      clientId: new Types.ObjectId(clientId),
      salonId: new Types.ObjectId(dto.salonId),
      stylistId: dto.stylistId ? new Types.ObjectId(dto.stylistId) : null,
      services: dto.services.map((s) => ({
        ...s,
        serviceId: new Types.ObjectId(s.serviceId),
      })),
      appointmentDate,
      startTime: dto.startTime,
      endTime,
      totalPrice,
      notes: dto.notes ?? null,
      status: BookingStatus.PENDING,
    });

    const response = this.toResponse(booking);
    await this.bookingQueue.add(BookingEvent.CREATED, response);
    return response;
  }

  async findAll(
    query: BookingListQueryDto,
    filter: Record<string, unknown> = {},
  ): Promise<PaginatedBookingsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { ...filter };

    if (query.status) where['status'] = query.status;
    if (query.date) {
      where['appointmentDate'] = new Date(`${query.date}T00:00:00.000Z`);
    }

    const [data, total] = await Promise.all([
      this.bookingModel.find(where).skip(skip).limit(limit).lean().exec(),
      this.bookingModel.countDocuments(where),
    ]);

    return {
      data: data.map((b) => this.toResponse(b as unknown as BookingDocument)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findById(id).lean().exec();
    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return this.toResponse(booking as unknown as BookingDocument);
  }

  async confirmBooking(bookingId: string): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Only PENDING bookings can be confirmed (current: ${booking.status})`,
      );
    }

    booking.status = BookingStatus.CONFIRMED;
    await booking.save();

    const response = this.toResponse(booking);
    await this.bookingQueue.add(BookingEvent.CONFIRMED, response);
    return response;
  }

  async cancelBooking(
    bookingId: string,
    userId: string,
    reason: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    const cancellable: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
    ];
    if (!cancellable.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot cancel a booking with status ${booking.status}`,
      );
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledBy = userId;
    booking.cancellationReason = reason;
    await booking.save();

    const response = this.toResponse(booking);
    await this.bookingQueue.add(BookingEvent.CANCELLED, { booking: response, reason });
    return response;
  }

  /** Internal: store the Google Calendar event ID returned by calendar-service */
  async setGoogleEventId(
    bookingId: string,
    googleEventId: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findByIdAndUpdate(
      bookingId,
      { googleEventId },
      { new: true },
    );
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    return this.toResponse(booking);
  }

  async completeBooking(bookingId: string): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    if (booking.status !== BookingStatus.IN_PROGRESS && booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `Only CONFIRMED or IN_PROGRESS bookings can be completed (current: ${booking.status})`,
      );
    }

    booking.status = BookingStatus.COMPLETED;
    await booking.save();

    const response = this.toResponse(booking);
    await this.bookingQueue.add(BookingEvent.COMPLETED, response);
    return response;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponse(booking: any): BookingResponseDto {
    return {
      id: (booking._id ?? booking.id)?.toString(),
      clientId: booking.clientId?.toString(),
      salonId: booking.salonId?.toString(),
      stylistId: booking.stylistId?.toString() ?? undefined,
      services: (booking.services ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => ({
          serviceId: s.serviceId?.toString(),
          name: s.name,
          price: s.price,
          durationMinutes: s.durationMinutes,
        }),
      ),
      appointmentDate: booking.appointmentDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      totalPrice: booking.totalPrice,
      notes: booking.notes ?? undefined,
      googleEventId: booking.googleEventId ?? undefined,
      cancelledBy: booking.cancelledBy ?? undefined,
      cancellationReason: booking.cancellationReason ?? undefined,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }
}

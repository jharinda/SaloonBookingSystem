import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { retry, timer } from 'rxjs';
import { Model, Types } from 'mongoose';
import { Queue } from 'bull';
import Redis from 'ioredis';
import { fromZonedTime } from 'date-fns-tz';

import { Booking, BookingDocument, BookingStatus } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingListQueryDto } from './dto/booking-query.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import {
  AvailableSlotsResponseDto,
  BookingResponseDto,
  PaginatedBookingsDto,
} from './dto/booking-response.dto';
import { BOOKING_QUEUE, BookingEvent } from './constants/booking-events.constants';

const SLOT_INTERVAL_MINUTES = 30;
const BOOKING_BUFFER_MINUTES = 15;
const CACHE_TTL_SECONDS = 60;
const SALON_TIMEZONE = 'Asia/Colombo';

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
  cancellationWindowHours?: number;
  autoConfirmBookings?: boolean;
}

/** Shape of the station returned by salon-service GET /api/salons/:id/stations */
interface StationInfo {
  _id: string;
  name: string;
  isActive: boolean;
}

interface StationsResponse {
  stations: StationInfo[];
  stationCount: number;
}

/** Shape of staff member returned by auth-service */
interface StaffMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
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
    const cacheKey = `slots:${salonId}:${date}:${durationMinutes}:${stylistId ?? 'any'}`;
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
        ).pipe(
          retry({
            count: 2,
            delay: (error, retryCount) => {
              this.logger.warn(`Retry ${retryCount}/2 for salon fetch: ${error.message}`);
              return timer(retryCount * 500);
            },
          }),
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

    // When stylistId is provided, show only that stylist's bookings.
    if (stylistId) {
      bookingQuery['stylistId'] = new Types.ObjectId(stylistId);
    }

    const existingBookings = await this.bookingModel
      .find(bookingQuery)
      .lean()
      .exec();

    // ── Step 4: Fetch station count from salon-service ───────────────────
    let stationCount = 1; // Default to 1 if unable to fetch
    try {
      const { data: stationsData } = await firstValueFrom(
        this.httpService.get<StationsResponse>(
          `${salonServiceUrl}/api/salons/${salonId}/stations`,
        ),
      );
      stationCount = stationsData.stationCount || 1;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch station count for salon ${salonId}: ${(err as Error).message}. Using default of 1.`,
      );
    }

    // ── Step 5: Build booking count per time slot ────────────────────────
    // For stylist-specific queries, we still use the old blocking logic.
    // For salon-level queries, we count concurrent bookings per slot.
    if (stylistId) {
      // Original logic for stylist-specific availability
      const blocked = existingBookings.map((b) => ({
        start: toMinutes(b.startTime),
        end:   toMinutes(b.endTime) + BOOKING_BUFFER_MINUTES,
      }));

      const available = allSlots.filter((slot) => {
        const slotStart = toMinutes(slot);
        const slotEnd   = slotStart + durationMinutes;
        return !blocked.some((b) => slotStart < b.end && slotEnd > b.start);
      });

      const result: AvailableSlotsResponseDto = { salonId, date, slots: available };
      await this.cacheResult(cacheKey, result);
      return result;
    }

    // ── Step 6: Filter slots based on station capacity ───────────────────
    // A slot is available if concurrent bookings < stationCount
    const available = allSlots.filter((slot) => {
      const slotStart = toMinutes(slot);
      const slotEnd   = slotStart + durationMinutes;

      // Count how many bookings overlap with this slot
      const concurrentBookings = existingBookings.filter((b) => {
        const bookingStart = toMinutes(b.startTime);
        const bookingEnd = toMinutes(b.endTime);
        return slotStart < bookingEnd && slotEnd > bookingStart;
      }).length;

      return concurrentBookings < stationCount;
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

    // Acquire a distributed lock to prevent double-booking races
    const lockKey = `booking-lock:${dto.salonId}:${dto.appointmentDate}:${dto.startTime}:${dto.stylistId ?? 'any'}`;
    const lockValue = await this.acquireLock(lockKey, 5, 3, 100);
    if (!lockValue) {
      throw new BadRequestException(
        'Slot is currently being reserved, please try again',
      );
    }

    try {
      // Validate the slot is still free
      const appointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);

      const clashQuery: Record<string, unknown> = {
        salonId: new Types.ObjectId(dto.salonId),
        appointmentDate,
        status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
      };

      // If booking for a specific stylist, check only that stylist's schedule
      if (dto.stylistId) {
        clashQuery['$and'] = [
          { stylistId: new Types.ObjectId(dto.stylistId) },
          {
            $or: [
              {
                // New booking starts during an existing one
                startTime: { $lt: endTime },
                endTime: { $gt: dto.startTime },
              },
            ],
          },
        ];

        const clash = await this.bookingModel.findOne(clashQuery);

        if (clash) {
          throw new BadRequestException(
            `The time slot ${dto.startTime}–${endTime} is no longer available`,
          );
        }
      } else {
        // No stylist specified — check salon-level availability against
        // station capacity. A slot is only fully booked when every active
        // station already has an overlapping booking.
        const salonServiceUrl = this.configService.get<string>(
          'services.salonUrl',
          'http://salon-service:3001',
        );

        let stationCount = 1;
        try {
          const { data: stationsData } = await firstValueFrom(
            this.httpService.get<StationsResponse>(
              `${salonServiceUrl}/api/salons/${dto.salonId}/stations`,
            ),
          );
          stationCount = stationsData.stationCount || 1;
        } catch (err) {
          this.logger.warn(
            `Failed to fetch station count during clash check: ${(err as Error).message}. Using default of 1.`,
          );
        }

        const overlappingCount = await this.bookingModel.countDocuments({
          salonId: new Types.ObjectId(dto.salonId),
          appointmentDate,
          status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          startTime: { $lt: endTime },
          endTime: { $gt: dto.startTime },
        });

        if (overlappingCount >= stationCount) {
          throw new BadRequestException(
            `The time slot ${dto.startTime}–${endTime} is no longer available`,
          );
        }
      }

      // ── Auto-assign station ────────────────────────────────────────────
      let assignedStationId: Types.ObjectId | null = null;
      let assignedStationName = '';

      try {
        const salonServiceUrl = this.configService.get<string>(
          'services.salonUrl',
          'http://salon-service:3001',
        );

        // Fetch all active stations
        const { data: stationsData } = await firstValueFrom(
          this.httpService.get<StationsResponse>(
            `${salonServiceUrl}/api/salons/${dto.salonId}/stations`,
          ).pipe(
            retry({
              count: 2,
              delay: (error, retryCount) => {
                this.logger.warn(`Retry ${retryCount}/2 for stations fetch: ${error.message}`);
                return timer(retryCount * 500);
              },
            }),
          ),
        );

        if (stationsData.stations.length === 0) {
          throw new BadRequestException('No stations available at this salon');
        }

        // Find bookings that overlap with the requested time slot
        const occupiedQuery: Record<string, unknown> = {
          salonId: new Types.ObjectId(dto.salonId),
          appointmentDate,
          status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          stationId: { $ne: null },
          $or: [
            {
              startTime: { $lt: endTime },
              endTime: { $gt: dto.startTime },
            },
          ],
        };

        const overlappingBookings = await this.bookingModel.find(occupiedQuery).lean().exec();
        const occupiedStationIds = new Set(
          overlappingBookings.map((b) => b.stationId?.toString()).filter(Boolean),
        );

        // Find first available station
        const availableStation = stationsData.stations.find(
          (station) => !occupiedStationIds.has(station._id),
        );

        if (!availableStation) {
          throw new BadRequestException(
            'No available stations at this time. Please choose a different time slot.',
          );
        }

        assignedStationId = new Types.ObjectId(availableStation._id);
        assignedStationName = availableStation.name;
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw err;
        }
        this.logger.error(
          `Station auto-assignment failed: ${(err as Error).message}`,
        );
        throw new BadRequestException('Unable to assign a station at this time');
      }

      // ── Auto-assign stylist (if not specified) ────────────────────────
      let assignedStylistId: Types.ObjectId | null = dto.stylistId ? new Types.ObjectId(dto.stylistId) : null;
      let assignedStylistName = '';
      let wasAssignedAutomatically = false;

      if (!dto.stylistId) {
        try {
          const authServiceUrl = this.configService.get<string>(
            'services.authUrl',
            'http://localhost:3003',
          );

          // Fetch all approved staff for this salon
          const { data: staffMembers } = await firstValueFrom(
            this.httpService.get<StaffMember[]>(
              `${authServiceUrl}/api/auth/salons/${dto.salonId}/staff`,
            ).pipe(
              retry({
                count: 2,
                delay: (error, retryCount) => {
                  this.logger.warn(`Retry ${retryCount}/2 for staff fetch: ${error.message}`);
                  return timer(retryCount * 500);
                },
              }),
            ),
          );

          if (staffMembers.length > 0) {
            // For each stylist, count bookings on this date that overlap the timeslot
            const stylistBookingCounts: Array<{ stylistId: string; name: string; count: number }> = [];

            for (const staff of staffMembers) {
              // Check if this stylist is already booked at this exact time
              const overlapQuery: Record<string, unknown> = {
                salonId: new Types.ObjectId(dto.salonId),
                appointmentDate,
                stylistId: new Types.ObjectId(staff._id),
                status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
                $or: [
                  {
                    startTime: { $lt: endTime },
                    endTime: { $gt: dto.startTime },
                  },
                ],
              };

              const hasOverlap = await this.bookingModel.findOne(overlapQuery).lean().exec();

              // If stylist is free at this time, count their total bookings that day
              if (!hasOverlap) {
                const dayBookingsCount = await this.bookingModel.countDocuments({
                  salonId: new Types.ObjectId(dto.salonId),
                  appointmentDate,
                  stylistId: new Types.ObjectId(staff._id),
                  status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
                });

                stylistBookingCounts.push({
                  stylistId: staff._id,
                  name: `${staff.firstName} ${staff.lastName}`.trim(),
                  count: dayBookingsCount,
                });
              }
            }

            // Pick the stylist with the fewest bookings (load balancing)
            if (stylistBookingCounts.length > 0) {
              stylistBookingCounts.sort((a, b) => a.count - b.count);
              const leastBusy = stylistBookingCounts[0];

              assignedStylistId = new Types.ObjectId(leastBusy.stylistId);
              assignedStylistName = leastBusy.name;
              wasAssignedAutomatically = true;

              this.logger.log(
                `Auto-assigned stylist ${leastBusy.name} (${leastBusy.count} bookings) to booking at ${dto.startTime}`,
              );
            } else {
              this.logger.log(
                `No available stylists for ${dto.appointmentDate} at ${dto.startTime} — stylist will remain unassigned`,
              );
            }
          }
        } catch (err) {
          this.logger.warn(
            `Stylist auto-assignment failed: ${(err as Error).message} — proceeding without stylist`,
          );
          // Non-fatal: continue with stylistId = null
        }
      } else {
        // Stylist was manually selected, fetch their name
        try {
          assignedStylistName = await this.fetchStylistName(dto.stylistId);
        } catch (err) {
          this.logger.warn(`Failed to fetch stylist name: ${(err as Error).message}`);
        }
      }

      const booking = await this.bookingModel.create({
        clientId: new Types.ObjectId(clientId),
        salonId: new Types.ObjectId(dto.salonId),
        salonName: dto.salonName ?? '',
        clientName: await this.fetchClientName(clientId),
        stylistId: assignedStylistId,
        stylistName: assignedStylistName,
        assignedAutomatically: wasAssignedAutomatically,
        stationId: assignedStationId,
        stationName: assignedStationName,
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

      // Invalidate slot cache since availability has changed
      try {
        await this.invalidateSlotCache(
          dto.salonId,
          dto.appointmentDate,
        );
      } catch (err) {
        // Cache invalidation errors are non-fatal
        this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
      }

      // ── Auto-confirm if the salon has enabled it ─────────────────────
      try {
        const salonServiceUrl = this.configService.get<string>(
          'services.salonUrl',
          'http://salon-service:3001',
        );
        const { data: salonData } = await firstValueFrom(
          this.httpService.get<SalonResponse>(
            `${salonServiceUrl}/api/salons/${dto.salonId}`,
          ),
        );
        if (salonData.autoConfirmBookings) {
          return await this.confirmBooking(String(booking._id));
        }
      } catch (err) {
        this.logger.warn(
          `Auto-confirm check failed for salon ${dto.salonId}: ${
            (err as Error).message
          } — booking left as PENDING`,
        );
      }

      return response;
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  async findAll(
    query: BookingListQueryDto,
    filter: Record<string, unknown> = {},
  ): Promise<PaginatedBookingsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { ...filter };

    // clientId is stored as ObjectId — convert the string from JWT so the query matches
    if (where['clientId'] && typeof where['clientId'] === 'string') {
      where['clientId'] = new Types.ObjectId(where['clientId'] as string);
    }

    if (query.salonId) where['salonId'] = new Types.ObjectId(query.salonId);
    if (query.status) where['status'] = query.status;
    if (query.date) {
      where['appointmentDate'] = new Date(`${query.date}T00:00:00.000Z`);
    }
    if (query.startDate || query.endDate) {
      const range: Record<string, Date> = {};
      if (query.startDate) range['$gte'] = new Date(`${query.startDate}T00:00:00.000Z`);
      if (query.endDate) range['$lte'] = new Date(`${query.endDate}T23:59:59.999Z`);
      where['appointmentDate'] = range;
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
    userRole: string,
    reason?: string,
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

    // ── Cancellation window check (clients only) ─────────────────────────────
    const isClient = userRole === 'client';
    if (isClient) {
      const salonServiceUrl = this.configService.get<string>(
        'services.salonUrl',
        'http://salon-service:3001',
      );

      let windowHours = 2;
      try {
        const { data } = await firstValueFrom(
          this.httpService.get<SalonResponse>(
            `${salonServiceUrl}/api/salons/${booking.salonId.toString()}`,
          ),
        );
        windowHours = data.cancellationWindowHours ?? 2;
      } catch (err) {
        this.logger.warn(
          `Could not fetch cancellation window for salon ${booking.salonId.toString()}: ${(err as Error).message}. Defaulting to ${windowHours}h.`,
        );
      }

      const appointmentDateStr = booking.appointmentDate
        .toISOString()
        .split('T')[0];
      const appointmentDt = new Date(
        `${appointmentDateStr}T${booking.startTime}:00+05:30`,
      );
      const msUntilAppointment = appointmentDt.getTime() - Date.now();
      const windowMs = windowHours * 60 * 60 * 1000;

      if (msUntilAppointment > 0 && msUntilAppointment < windowMs) {
        throw new BadRequestException(
          `Cancellations must be made at least ${windowHours} hour${windowHours === 1 ? '' : 's'} before the appointment`,
        );
      }
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledBy = userId;
    booking.cancellationReason = reason;
    await booking.save();

    const response = this.toResponse(booking);
    await this.bookingQueue.add(BookingEvent.CANCELLED, { booking: response, reason });

    // Invalidate slot cache since availability has changed
    try {
      const appointmentDateStr = booking.appointmentDate.toISOString().split('T')[0];
      await this.invalidateSlotCache(
        booking.salonId.toString(),
        appointmentDateStr,
      );
    } catch (err) {
      // Cache invalidation errors are non-fatal
      this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
    }

    return response;
  }

  async rescheduleBooking(
    bookingId: string,
    dto: RescheduleBookingDto,
    userId: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    // Only the client who created the booking may reschedule
    if (booking.clientId.toString() !== userId) {
      throw new ForbiddenException('You can only reschedule your own bookings');
    }

    const reschedulable: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
    ];
    if (!reschedulable.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot reschedule a booking with status ${booking.status}`,
      );
    }

    // Calculate total service duration (same as at creation time)
    const totalDuration = booking.services.reduce(
      (acc, s) => acc + s.durationMinutes,
      0,
    );

    // Verify the new slot is available
    const availability = await this.getAvailableSlots(
      booking.salonId.toString(),
      booking.stylistId ? booking.stylistId.toString() : null,
      dto.appointmentDate,
      totalDuration,
    );

    if (!availability.slots.includes(dto.startTime)) {
      throw new BadRequestException(
        `The slot ${dto.startTime} on ${dto.appointmentDate} is not available`,
      );
    }

    const wasConfirmed = booking.status === BookingStatus.CONFIRMED;
    const newEndTime = addMinutes(dto.startTime, totalDuration);
    const newAppointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);

    // Save old date before updating
    const oldAppointmentDateStr = booking.appointmentDate.toISOString().split('T')[0];

    // Store old appointment date for audit trail
    booking.rescheduledFrom = booking.appointmentDate;

    booking.appointmentDate = newAppointmentDate;
    booking.startTime = dto.startTime;
    booking.endTime = newEndTime;

    // Revert CONFIRMED bookings to PENDING so salon owner can re-confirm the new time
    if (wasConfirmed) {
      booking.status = BookingStatus.PENDING;
    }

    await booking.save();

    const response = this.toResponse(booking);

    // Always emit RESCHEDULED event so notifications fire
    await this.bookingQueue.add(BookingEvent.RESCHEDULED, response);

    // Invalidate slot cache for both old and new dates
    try {
      // Invalidate old date
      await this.invalidateSlotCache(
        booking.salonId.toString(),
        oldAppointmentDateStr,
      );
      // Invalidate new date
      await this.invalidateSlotCache(
        booking.salonId.toString(),
        dto.appointmentDate,
      );
    } catch (err) {
      // Cache invalidation errors are non-fatal
      this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
    }

    return response;
  }

  /** Internal: store the Google Calendar event ID returned by calendar-service */
  async setGoogleEventId(
    bookingId: string,
    googleEventId: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findByIdAndUpdate(
      bookingId,
      { googleEventId, calendarSyncStatus: 'synced' },
      { new: true },
    );
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    return this.toResponse(booking);
  }

  /** Internal: update calendar sync status called by calendar-service */
  async updateCalendarSyncStatus(
    bookingId: string,
    status: 'pending' | 'synced' | 'failed',
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findByIdAndUpdate(
      bookingId,
      { calendarSyncStatus: status },
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

  /**
   * Assign a booking to a different station (salon owner only).
   * Validates that the new station is free at the booking's time.
   */
  async assignStation(
    bookingId: string,
    stationId: string,
    userId: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    // Validate ownership by fetching salon details
    const salonServiceUrl = this.configService.get<string>(
      'services.salonUrl',
      'http://salon-service:3001',
    );

    let salon: { ownerId: string };
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{ ownerId: string }>(
          `${salonServiceUrl}/api/salons/${booking.salonId.toString()}`,
        ),
      );
      salon = data;
    } catch (err) {
      this.logger.error(
        `Failed to fetch salon ${booking.salonId.toString()}: ${(err as Error).message}`,
      );
      throw new ForbiddenException('Unable to verify salon ownership');
    }

    if (salon.ownerId !== userId) {
      throw new ForbiddenException('Only the salon owner can reassign stations');
    }

    // Fetch station details to validate it exists and get its name
    let stationInfo: StationInfo;
    try {
      const { data: stationsData } = await firstValueFrom(
        this.httpService.get<StationsResponse>(
          `${salonServiceUrl}/api/salons/${booking.salonId.toString()}/stations`,
        ),
      );

      const station = stationsData.stations.find((s) => s._id === stationId);
      if (!station) {
        throw new NotFoundException(`Station ${stationId} not found`);
      }
      if (!station.isActive) {
        throw new BadRequestException(`Station ${station.name} is not active`);
      }
      stationInfo = station;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(
        `Failed to fetch stations for salon ${booking.salonId.toString()}: ${(err as Error).message}`,
      );
      throw new BadRequestException('Unable to validate station');
    }

    // Check if the new station is occupied at this time
    const appointmentDateStr = booking.appointmentDate.toISOString().split('T')[0];
    const clashQuery: Record<string, unknown> = {
      salonId: booking.salonId,
      appointmentDate: new Date(`${appointmentDateStr}T00:00:00.000Z`),
      stationId: new Types.ObjectId(stationId),
      status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
      _id: { $ne: booking._id }, // Exclude the current booking
      $or: [
        {
          startTime: { $lt: booking.endTime },
          endTime: { $gt: booking.startTime },
        },
      ],
    };

    const clash = await this.bookingModel.findOne(clashQuery);
    if (clash) {
      throw new BadRequestException(
        `Station ${stationInfo.name} is occupied during ${booking.startTime}–${booking.endTime}`,
      );
    }

    // Update the booking
    booking.stationId = new Types.ObjectId(stationId);
    booking.stationName = stationInfo.name;
    await booking.save();

    return this.toResponse(booking);
  }

  // ── Scheduled: auto-complete overdue bookings ─────────────────────────────

  /**
   * Runs every minute.
   * Finds CONFIRMED / IN_PROGRESS bookings whose end time has passed and marks
   * them COMPLETED so the client's appointment list stays accurate without
   * needing manual intervention.
   *
   * Timezone handling: appointmentDate is stored as UTC midnight (e.g., 2026-03-10T00:00:00.000Z),
   * and endTime is "HH:mm" in the salon's local timezone (Asia/Colombo).
   * We reconstruct the actual UTC moment using zonedTimeToUtc() to avoid offset errors.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async autoCompleteOverdueBookings(): Promise<void> {
    const now = new Date();

    // Fetch all active bookings up to (but not including) tomorrow's UTC midnight
    // so we definitely catch everything that could have ended by now.
    const tomorrowUtcMidnight = new Date(now);
    tomorrowUtcMidnight.setUTCHours(0, 0, 0, 0);
    tomorrowUtcMidnight.setUTCDate(tomorrowUtcMidnight.getUTCDate() + 1);

    const candidates = await this.bookingModel
      .find({
        status: { $in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
        appointmentDate: { $lt: tomorrowUtcMidnight },
      })
      .lean()
      .exec();

    // Reconstruct end datetime from the stored UTC-midnight date + "HH:mm" endTime.
    // endTime is in local salon time, so we parse it in the salon's timezone and
    // convert to UTC for accurate comparison.
    const overdue = candidates.filter((b) => {
      const apptDate = new Date(b.appointmentDate);
      // Format as YYYY-MM-DD in UTC
      const dateStr = apptDate.toISOString().split('T')[0];
      // Combine with endTime to get a local datetime string, then convert to UTC
      const endUtc = fromZonedTime(`${dateStr}T${b.endTime}:00`, SALON_TIMEZONE);
      return endUtc.getTime() < now.getTime();
    });

    if (!overdue.length) return;

    const ids = overdue.map((b) => b._id);
    await this.bookingModel.updateMany(
      { _id: { $in: ids } },
      { $set: { status: BookingStatus.COMPLETED } },
    );
    this.logger.log(`[Scheduler] Auto-completed ${overdue.length} overdue booking(s)`);

    // Fire COMPLETED events for queue consumers (notifications, calendar, etc.)
    for (const b of overdue) {
      const response = this.toResponse(b as unknown as BookingDocument);
      response.status = BookingStatus.COMPLETED;
      await this.bookingQueue.add(BookingEvent.COMPLETED, response).catch(() => {/* non-fatal */});
    }
  }

  // ── Scheduled: auto-cancel expired pending bookings ───────────────────────

  /**
   * Runs every minute.
   * Finds PENDING bookings whose appointment start time has already passed and
   * marks them CANCELLED.  These are bookings the salon never confirmed — the
   * client should see them as cancelled, not pending, and must NOT be able to
   * leave a review for them.
   *
   * Timezone handling: appointmentDate is stored as UTC midnight (e.g., 2026-03-10T00:00:00.000Z),
   * and startTime is "HH:mm" in the salon's local timezone (Asia/Colombo).
   * We reconstruct the actual UTC moment using zonedTimeToUtc() to avoid offset errors.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async autoCancelExpiredPendingBookings(): Promise<void> {
    const now = new Date();

    const tomorrowUtcMidnight = new Date(now);
    tomorrowUtcMidnight.setUTCHours(0, 0, 0, 0);
    tomorrowUtcMidnight.setUTCDate(tomorrowUtcMidnight.getUTCDate() + 1);

    const candidates = await this.bookingModel
      .find({
        status: BookingStatus.PENDING,
        appointmentDate: { $lt: tomorrowUtcMidnight },
      })
      .lean()
      .exec();

    // Use startTime (not endTime) — if the appointment start has passed and it
    // was never confirmed, there is no point waiting for the end time.
    // startTime is in local salon time, so we parse it in the salon's timezone and
    // convert to UTC for accurate comparison.
    const expired = candidates.filter((b) => {
      const apptDate = new Date(b.appointmentDate);
      // Format as YYYY-MM-DD in UTC
      const dateStr = apptDate.toISOString().split('T')[0];
      // Combine with startTime to get a local datetime string, then convert to UTC
      const startUtc = fromZonedTime(`${dateStr}T${b.startTime}:00`, SALON_TIMEZONE);
      return startUtc.getTime() < now.getTime();
    });

    if (!expired.length) return;

    const ids = expired.map((b) => b._id);
    await this.bookingModel.updateMany(
      { _id: { $in: ids } },
      { $set: { status: BookingStatus.CANCELLED } },
    );
    this.logger.log(`[Scheduler] Auto-cancelled ${expired.length} expired pending booking(s)`);

    // Fire CANCELLED events so downstream consumers (notifications, etc.) are aware.
    for (const b of expired) {
      const response = this.toResponse(b as unknown as BookingDocument);
      response.status = BookingStatus.CANCELLED;
      await this.bookingQueue.add(BookingEvent.CANCELLED, response).catch(() => {/* non-fatal */});
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Try to acquire a Redis SET NX EX lock.
   * Returns the unique lock value on success, or null if all retries are exhausted.
   */
  private async acquireLock(
    key: string,
    ttlSeconds: number,
    retries: number,
    retryDelayMs: number,
  ): Promise<string | null> {
    const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    for (let attempt = 0; attempt < retries; attempt++) {
      const result = await this.redis.set(key, lockValue, 'EX', ttlSeconds, 'NX');
      if (result === 'OK') {
        return lockValue;
      }
      if (attempt < retries - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    return null;
  }

  /**
   * Atomically release a Redis lock only if it still holds our value,
   * preventing accidental release of a lock acquired by another process.
   */
  private async releaseLock(key: string, value: string): Promise<void> {
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await this.redis.eval(luaScript, 1, key, value);
    } catch (err) {
      this.logger.warn(`Failed to release lock ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * Invalidate Redis cache for available slots on a given date.
   * Deletes all cached slot entries matching the salon and date.
   */
  private async invalidateSlotCache(
    salonId: string,
    date: string,
  ): Promise<void> {
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

  private async fetchClientName(clientId: string): Promise<string> {
    const authUrl = this.configService.get<string>('services.authUrl', 'http://localhost:3003');
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${authUrl}/api/auth/users/${clientId}`),
      );
      return (
        data.name ??
        (`${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || 'Unknown')
      );
    } catch {
      return '';
    }
  }

  private async fetchStylistName(stylistId: string): Promise<string> {
    const authUrl = this.configService.get<string>('services.authUrl', 'http://localhost:3003');
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${authUrl}/api/auth/users/${stylistId}`),
      );
      return `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || 'Unknown';
    } catch {
      return '';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponse(booking: any): BookingResponseDto {
    const id = (booking._id ?? booking.id)?.toString();
    const services = (booking.services ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => ({
        serviceId: s.serviceId?.toString(),
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
      }),
    );
    return {
      id,
      _id: id,
      clientId: booking.clientId?.toString(),
      clientName: booking.clientName ?? '',
      salonId: booking.salonId?.toString(),
      salonName: booking.salonName ?? '',
      serviceName: services[0]?.name ?? '',
      stylistId: booking.stylistId?.toString() ?? undefined,
      stylistName: booking.stylistName ?? undefined,
      assignedAutomatically: booking.assignedAutomatically ?? false,
      stationId: booking.stationId?.toString() ?? undefined,
      stationName: booking.stationName ?? '',
      services,
      appointmentDate: booking.appointmentDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      totalPrice: booking.totalPrice,
      notes: booking.notes ?? undefined,
      googleEventId: booking.googleEventId ?? undefined,
      calendarSyncStatus: booking.calendarSyncStatus ?? 'pending',
      cancelledBy: booking.cancelledBy ?? undefined,
      cancellationReason: booking.cancellationReason ?? undefined,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }
}

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
import { REDIS_CLIENT } from '@org/shared-auth';

import { Booking, BookingDocument } from './schemas/booking.schema';
import { BookingStatus } from '@org/models';
import { StylistBreak, StylistBreakDocument } from './schemas/stylist-break.schema';
import { WaitlistEntry, WaitlistEntryDocument } from './schemas/waitlist.schema';
import { JoinWaitlistDto, WaitlistEntryResponseDto } from './dto/waitlist.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateManualBookingDto } from './dto/create-manual-booking.dto';
import { BookingListQueryDto } from './dto/booking-query.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { ModifyBookingDto } from './dto/modify-booking.dto';
import {
  AvailableSlotsResponseDto,
  BookingResponseDto,
  PaginatedBookingsDto,
} from './dto/booking-response.dto';
import {
  BookingStatusBreakdownDto,
  ClientAnalyticsResponseDto,
  DailyRevenueDto,
  PeakHourDto,
  SalonAnalyticsResponseDto,
} from './dto/analytics.dto';
import { BOOKING_QUEUE, BookingEvent } from './constants/booking-events.constants';
import { SubscriptionCheckService } from '@org/subscription-check';

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
    @InjectModel(StylistBreak.name)
    private readonly breakModel: Model<StylistBreakDocument>,
    @InjectModel(WaitlistEntry.name)
    private readonly waitlistModel: Model<WaitlistEntryDocument>,
    @InjectQueue(BOOKING_QUEUE)
    private readonly bookingQueue: Queue,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly subscriptionCheck: SubscriptionCheckService,
    @Inject(REDIS_CLIENT)
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
      // Also fetch breaks for this stylist on this date to block those slots
      const stylistBreaks = await this.breakModel
        .find({
          stylistId: new Types.ObjectId(stylistId),
          date: new Date(`${date}T00:00:00.000Z`),
        })
        .lean()
        .exec();

      // Original logic for stylist-specific availability
      const blocked = existingBookings.map((b) => ({
        start: toMinutes(b.startTime),
        end:   toMinutes(b.endTime) + BOOKING_BUFFER_MINUTES,
      }));

      // Treat each break window as fully blocked (no buffer needed)
      const breakBlocked = stylistBreaks.map((br) => ({
        start: toMinutes(br.startTime),
        end:   toMinutes(br.endTime),
      }));

      const available = allSlots.filter((slot) => {
        const slotStart = toMinutes(slot);
        const slotEnd   = slotStart + durationMinutes;
        const blockedByBooking = blocked.some((b) => slotStart < b.end && slotEnd > b.start);
        const blockedByBreak  = breakBlocked.some((br) => slotStart < br.end && slotEnd > br.start);
        return !blockedByBooking && !blockedByBreak;
      });

      const result: AvailableSlotsResponseDto = { salonId, date, slots: available };
      await this.cacheResult(cacheKey, result);
      return result;
    }

    // ── Step 6: Check per-stylist availability for "any stylist" bookings ──
    // A slot is shown only if at least one stylist has no break AND no booking
    // overlapping it. Falls back to station-capacity logic if staff cannot be
    // fetched (e.g. auth-service is down).

    // 6a. Fetch all staff IDs for this salon
    let staffIds: string[] = [];
    try {
      const authServiceUrl = this.configService.get<string>(
        'services.authUrl',
        'http://localhost:3003',
      );
      const { data: staffMembers } = await firstValueFrom(
        this.httpService.get<Array<{ _id: string }>>(
          `${authServiceUrl}/api/auth/salons/${salonId}/staff`,
        ),
      );
      staffIds = staffMembers.map((s) => s._id);
    } catch (err) {
      this.logger.warn(
        `Failed to fetch staff for salon ${salonId}: ${(err as Error).message}. Falling back to station-capacity logic.`,
      );
    }

    if (staffIds.length === 0) {
      // Fallback: original station-capacity check
      const available = allSlots.filter((slot) => {
        const slotStart = toMinutes(slot);
        const slotEnd   = slotStart + durationMinutes;
        const concurrent = existingBookings.filter((b) => {
          const bs = toMinutes(b.startTime);
          const be = toMinutes(b.endTime);
          return slotStart < be && slotEnd > bs;
        }).length;
        return concurrent < stationCount;
      });
      const result: AvailableSlotsResponseDto = { salonId, date, slots: available };
      await this.cacheResult(cacheKey, result);
      return result;
    }

    // 6b. Fetch all breaks for the salon on this date
    const salonBreaks = await this.breakModel
      .find({
        salonId: new Types.ObjectId(salonId),
        date: new Date(`${date}T00:00:00.000Z`),
      })
      .lean()
      .exec();

    // 6c. A slot is available if at least one stylist is free at that slot
    const available = allSlots.filter((slot) => {
      const slotStart = toMinutes(slot);
      const slotEnd   = slotStart + durationMinutes;

      return staffIds.some((staffId) => {
        // Check breaks
        const hasBreak = salonBreaks.some((br) => {
          if (br.stylistId.toString() !== staffId) return false;
          const brStart = toMinutes(br.startTime);
          const brEnd   = toMinutes(br.endTime);
          return slotStart < brEnd && slotEnd > brStart;
        });
        if (hasBreak) return false;

        // Check existing bookings
        const hasBooking = existingBookings.some((b) => {
          if (!b.stylistId || b.stylistId.toString() !== staffId) return false;
          const bStart = toMinutes(b.startTime);
          const bEnd   = toMinutes(b.endTime) + BOOKING_BUFFER_MINUTES;
          return slotStart < bEnd && slotEnd > bStart;
        });
        return !hasBooking;
      });
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
    // Verify the salon has an active subscription before accepting bookings
    const subCheck = await this.subscriptionCheck.getFeatureCheckDetails(dto.salonId, 'basic_booking');
    if (!subCheck.allowed) {
      throw new BadRequestException(
        subCheck.reason || 'This salon\'s subscription is not active. Bookings are currently unavailable.',
      );
    }

    const totalDuration = dto.services.reduce(
      (acc, s) => acc + s.durationMinutes,
      0,
    );
    const endTime = addMinutes(dto.startTime, totalDuration);
    const totalPrice = dto.services.reduce((acc, s) => acc + s.price, 0);

    // Acquire a distributed lock to prevent double-booking races to prevent double-booking races
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

      // ── Break conflict check (when stylistId is known) ─────────────────
      // This applies whether the stylist was explicitly chosen or auto-assigned.
      // We check before auto-assign because the assigned stylist's break isn't
      // known yet — after auto-assign (below) we re-validate.
      if (dto.stylistId) {
        const breakConflict = await this.breakModel.findOne({
          stylistId: new Types.ObjectId(dto.stylistId),
          date: new Date(`${dto.appointmentDate}T00:00:00.000Z`),
          startTime: { $lt: endTime },
          endTime: { $gt: dto.startTime },
        });

        if (breakConflict) {
          throw new BadRequestException(
            `The selected stylist is on a break from ${breakConflict.startTime} to ${breakConflict.endTime}. Please choose a different time or stylist.`,
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
            // Fetch all breaks for the salon on this date once (avoids N+1)
            const dateStart = new Date(`${dto.appointmentDate}T00:00:00.000Z`);
            const allBreaks = await this.breakModel
              .find({ salonId: new Types.ObjectId(dto.salonId), date: dateStart })
              .lean()
              .exec();

            // Collect stylists who are fully free at this slot (no booking, no break)
            const freeStylists: Array<{ stylistId: string; name: string }> = [];

            for (const staff of staffMembers) {
              // Check break overlap
              const hasBreak = allBreaks.some((br) => {
                if (br.stylistId.toString() !== staff._id) return false;
                const brStart = toMinutes(br.startTime);
                const brEnd   = toMinutes(br.endTime);
                return toMinutes(dto.startTime) < brEnd && toMinutes(endTime) > brStart;
              });
              if (hasBreak) continue;

              // Check booking overlap
              const hasOverlap = await this.bookingModel.findOne({
                salonId: new Types.ObjectId(dto.salonId),
                appointmentDate,
                stylistId: new Types.ObjectId(staff._id),
                status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
                startTime: { $lt: endTime },
                endTime:   { $gt: dto.startTime },
              }).lean().exec();
              if (hasOverlap) continue;

              freeStylists.push({
                stylistId: staff._id,
                name: `${staff.firstName} ${staff.lastName}`.trim(),
              });
            }

            if (freeStylists.length > 0) {
              // Pick a random free stylist
              const picked = freeStylists[Math.floor(Math.random() * freeStylists.length)];
              assignedStylistId = new Types.ObjectId(picked.stylistId);
              assignedStylistName = picked.name;
              wasAssignedAutomatically = true;
              this.logger.log(
                `Auto-assigned stylist ${picked.name} (random from ${freeStylists.length} available) to booking at ${dto.startTime}`,
              );
            } else {
              throw new BadRequestException(
                'No stylists are available at this time slot. Please choose a different time.',
              );
            }
          }
        } catch (err) {
          if (err instanceof BadRequestException) throw err;
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

  /**
   * Create a booking on behalf of a client (salon-owner manual booking).
   * Re-uses the same slot-validation, station-assignment and stylist-assignment
   * logic but takes clientId from the request body instead of the JWT.
   */
  async createManualBooking(
    dto: CreateManualBookingDto,
  ): Promise<BookingResponseDto> {
    // Verify the salon has an active subscription before accepting bookings
    const subCheck = await this.subscriptionCheck.getFeatureCheckDetails(dto.salonId, 'basic_booking');
    if (!subCheck.allowed) {
      throw new BadRequestException(
        subCheck.reason || 'This salon\'s subscription is not active. Bookings are currently unavailable.',
      );
    }

    const totalDuration = dto.services.reduce(
      (acc, s) => acc + s.durationMinutes,
      0,
    );
    const endTime = addMinutes(dto.startTime, totalDuration);
    const totalPrice = dto.services.reduce((acc, s) => acc + s.price, 0);

    const lockKey = `booking-lock:${dto.salonId}:${dto.appointmentDate}:${dto.startTime}:${dto.stylistId ?? 'any'}`;
    const lockValue = await this.acquireLock(lockKey, 5, 3, 100);
    if (!lockValue) {
      throw new BadRequestException(
        'Slot is currently being reserved, please try again',
      );
    }

    try {
      const appointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);

      // Clash check for specific stylist
      if (dto.stylistId) {
        const clash = await this.bookingModel.findOne({
          salonId: new Types.ObjectId(dto.salonId),
          appointmentDate,
          status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          $and: [
            { stylistId: new Types.ObjectId(dto.stylistId) },
            { startTime: { $lt: endTime }, endTime: { $gt: dto.startTime } },
          ],
        });
        if (clash) {
          throw new BadRequestException(
            `The time slot ${dto.startTime}–${endTime} is no longer available`,
          );
        }

        // Break conflict
        const breakConflict = await this.breakModel.findOne({
          stylistId: new Types.ObjectId(dto.stylistId),
          date: appointmentDate,
          startTime: { $lt: endTime },
          endTime: { $gt: dto.startTime },
        });
        if (breakConflict) {
          throw new BadRequestException(
            `The selected stylist is on a break from ${breakConflict.startTime} to ${breakConflict.endTime}.`,
          );
        }
      }

      // Auto-assign station
      let assignedStationId: Types.ObjectId | null = null;
      let assignedStationName = '';
      const salonServiceUrl = this.configService.get<string>(
        'services.salonUrl',
        'http://salon-service:3001',
      );

      try {
        const { data: stationsData } = await firstValueFrom(
          this.httpService.get<StationsResponse>(
            `${salonServiceUrl}/api/salons/${dto.salonId}/stations`,
          ),
        );
        if (stationsData.stations.length > 0) {
          const overlappingBookings = await this.bookingModel
            .find({
              salonId: new Types.ObjectId(dto.salonId),
              appointmentDate,
              status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
              stationId: { $ne: null },
              startTime: { $lt: endTime },
              endTime: { $gt: dto.startTime },
            })
            .lean()
            .exec();
          const occupied = new Set(
            overlappingBookings.map((b) => b.stationId?.toString()).filter(Boolean),
          );
          const available = stationsData.stations.find((s) => !occupied.has(s._id));
          if (available) {
            assignedStationId = new Types.ObjectId(available._id);
            assignedStationName = available.name;
          }
        }
      } catch (err) {
        this.logger.warn(`Station auto-assignment failed for manual booking: ${(err as Error).message}`);
      }

      // Stylist assignment
      let assignedStylistId: Types.ObjectId | null = dto.stylistId
        ? new Types.ObjectId(dto.stylistId)
        : null;
      let assignedStylistName = '';
      let wasAssignedAutomatically = false;

      if (dto.stylistId) {
        try {
          assignedStylistName = await this.fetchStylistName(dto.stylistId);
        } catch {
          /* non-fatal */
        }
      } else {
        // Auto-assign stylist
        try {
          const authServiceUrl = this.configService.get<string>(
            'services.authUrl',
            'http://localhost:3003',
          );
          const { data: staffMembers } = await firstValueFrom(
            this.httpService.get<StaffMember[]>(
              `${authServiceUrl}/api/auth/salons/${dto.salonId}/staff`,
            ),
          );
          if (staffMembers.length > 0) {
            const dateStart = new Date(`${dto.appointmentDate}T00:00:00.000Z`);
            const allBreaks = await this.breakModel
              .find({ salonId: new Types.ObjectId(dto.salonId), date: dateStart })
              .lean()
              .exec();

            const freeStylists: Array<{ stylistId: string; name: string }> = [];
            for (const staff of staffMembers) {
              const hasBreak = allBreaks.some((br) => {
                if (br.stylistId.toString() !== staff._id) return false;
                return toMinutes(br.startTime) < toMinutes(endTime) && toMinutes(br.endTime) > toMinutes(dto.startTime);
              });
              if (hasBreak) continue;

              const hasOverlap = await this.bookingModel.findOne({
                salonId: new Types.ObjectId(dto.salonId),
                appointmentDate,
                stylistId: new Types.ObjectId(staff._id),
                status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
                startTime: { $lt: endTime },
                endTime: { $gt: dto.startTime },
              }).lean().exec();
              if (hasOverlap) continue;

              freeStylists.push({
                stylistId: staff._id,
                name: `${staff.firstName} ${staff.lastName}`.trim(),
              });
            }

            if (freeStylists.length > 0) {
              const picked = freeStylists[Math.floor(Math.random() * freeStylists.length)];
              assignedStylistId = new Types.ObjectId(picked.stylistId);
              assignedStylistName = picked.name;
              wasAssignedAutomatically = true;
            }
          }
        } catch (err) {
          if (err instanceof BadRequestException) throw err;
          this.logger.warn(`Stylist auto-assign failed for manual booking: ${(err as Error).message}`);
        }
      }

      const booking = await this.bookingModel.create({
        clientId: new Types.ObjectId(dto.clientId),
        salonId: new Types.ObjectId(dto.salonId),
        salonName: dto.salonName ?? '',
        clientName: dto.clientName,
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
        status: BookingStatus.CONFIRMED,
        isManualBooking: true,
      });

      const response = this.toResponse(booking);
      await this.bookingQueue.add(BookingEvent.CREATED, response);

      try {
        await this.invalidateSlotCache(dto.salonId, dto.appointmentDate);
      } catch {
        /* non-fatal */
      }

      return response;
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  /** Sort for paginated lists: default chronological by appointment; optional `createdAt` (newest first). */
  private buildBookingListSort(query: BookingListQueryDto): Record<string, 1 | -1> {
    if (query.sortBy === 'createdAt') {
      const dir = query.sortOrder === 'asc' ? 1 : -1;
      return { createdAt: dir };
    }
    return { appointmentDate: 1, startTime: 1 };
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

    // stylistId is stored as ObjectId — convert when passed via filter from controller
    if (where['stylistId'] && typeof where['stylistId'] === 'string') {
      where['stylistId'] = new Types.ObjectId(where['stylistId'] as string);
    }

    // salonId passed via filter also needs ObjectId conversion
    if (where['salonId'] && typeof where['salonId'] === 'string') {
      where['salonId'] = new Types.ObjectId(where['salonId'] as string);
    }

    if (query.salonId) where['salonId'] = new Types.ObjectId(query.salonId);
    if (query.stylistId) where['stylistId'] = new Types.ObjectId(query.stylistId);
    if (query.serviceId) {
      where['services.serviceId'] = new Types.ObjectId(query.serviceId);
    }
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

    const sort = this.buildBookingListSort(query);

    const [data, total] = await Promise.all([
      this.bookingModel
        .find(where)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
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

  // ── Salon analytics ─────────────────────────────────────────────────────

  /**
   * Aggregated salon metrics for a date range (by appointmentDate).
   * Revenue counts only COMPLETED bookings. Separate pipelines keep each metric clear.
   */
  async getSalonAnalytics(
    salonId: string,
    from: string,
    to: string,
  ): Promise<SalonAnalyticsResponseDto> {
    if (!Types.ObjectId.isValid(salonId)) {
      throw new BadRequestException('Invalid salon ID');
    }

    let fromStr = from;
    let toStr = to;
    if (fromStr > toStr) {
      [fromStr, toStr] = [toStr, fromStr];
    }

    const salonOid = new Types.ObjectId(salonId);
    const rangeStart = new Date(`${fromStr}T00:00:00.000Z`);
    const rangeEnd = new Date(`${toStr}T23:59:59.999Z`);
    const matchFilter = {
      salonId: salonOid,
      appointmentDate: { $gte: rangeStart, $lte: rangeEnd },
    };

    const [
      dailyRows,
      statusRows,
      peakRows,
      topServiceRows,
      totalsRows,
    ] = await Promise.all([
      this.bookingModel
        .aggregate<{
          _id: string;
          revenue: number;
          count: number;
        }>([
          { $match: matchFilter },
          { $match: { status: BookingStatus.COMPLETED } },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$appointmentDate',
                  timezone: 'UTC',
                },
              },
              revenue: { $sum: '$totalPrice' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .exec(),
      this.bookingModel
        .aggregate<{ _id: BookingStatus; count: number }>([
          { $match: matchFilter },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.bookingModel
        .aggregate<{ _id: number; count: number }>([
          { $match: matchFilter },
          {
            $addFields: {
              hour: {
                $toInt: {
                  $substrCP: ['$startTime', 0, 2],
                },
              },
            },
          },
          { $group: { _id: '$hour', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .exec(),
      this.bookingModel
        .aggregate<{
          _id: string;
          count: number;
          revenue: number;
        }>([
          { $match: matchFilter },
          { $match: { status: BookingStatus.COMPLETED } },
          { $unwind: '$services' },
          {
            $group: {
              _id: '$services.name',
              count: { $sum: 1 },
              revenue: { $sum: '$services.price' },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 10 },
        ])
        .exec(),
      this.bookingModel
        .aggregate<{
          totalBookings: number;
          totalRevenue: number;
          completedCount: number;
        }>([
          { $match: matchFilter },
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              totalRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', BookingStatus.COMPLETED] },
                    '$totalPrice',
                    0,
                  ],
                },
              },
              completedCount: {
                $sum: {
                  $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0],
                },
              },
            },
          },
        ])
        .exec(),
    ]);

    const byStatus = Object.fromEntries(
      statusRows.map((r) => [r._id, r.count]),
    ) as Record<string, number>;

    const statusBreakdown: BookingStatusBreakdownDto = {
      pending: byStatus[BookingStatus.PENDING] ?? 0,
      confirmed:
        (byStatus[BookingStatus.CONFIRMED] ?? 0) +
        (byStatus[BookingStatus.IN_PROGRESS] ?? 0),
      completed: byStatus[BookingStatus.COMPLETED] ?? 0,
      cancelled: byStatus[BookingStatus.CANCELLED] ?? 0,
      noShow: byStatus[BookingStatus.NO_SHOW] ?? 0,
    };

    const completed = statusBreakdown.completed;
    const cancelled = statusBreakdown.cancelled;
    const noShow = statusBreakdown.noShow;
    const terminalDen = completed + cancelled + noShow;
    const completionRate =
      terminalDen > 0 ? completed / terminalDen : 0;

    const totals = totalsRows[0];
    const totalBookings = totals?.totalBookings ?? 0;
    const totalRevenue = totals?.totalRevenue ?? 0;
    const completedCount = totals?.completedCount ?? 0;
    const averageBookingValue =
      completedCount > 0 ? totalRevenue / completedCount : 0;

    const dailyMap = new Map(
      dailyRows.map((r) => [r._id, { revenue: r.revenue, count: r.count }]),
    );
    const dateKeys = this.enumerateDateStrings(fromStr, toStr);
    const dailyRevenue: DailyRevenueDto[] = dateKeys.map((d) => {
      const row = dailyMap.get(d);
      return {
        date: d,
        revenue: row?.revenue ?? 0,
        count: row?.count ?? 0,
      };
    });

    const peakByHour = new Map(peakRows.map((r) => [r._id, r.count]));
    const peakHours: PeakHourDto[] = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: peakByHour.get(h) ?? 0,
    }));

    const topServices: SalonAnalyticsResponseDto['topServices'] = topServiceRows.map(
      (r) => ({
        serviceName: r._id,
        count: r.count,
        revenue: r.revenue,
      }),
    );

    return {
      salonId,
      period: { from: fromStr, to: toStr },
      totalRevenue,
      totalBookings,
      completionRate,
      averageBookingValue,
      dailyRevenue,
      statusBreakdown,
      peakHours,
      topServices,
    };
  }

  /**
   * Bookings on a calendar day (UTC) that are not yet finished (still on the schedule).
   */
  async getPlatformStats(): Promise<{
    bookingsToday: number;
    monthlyRevenue: number;
    totalBookings: number;
    completionRate: number;
    revenueBySalon: Array<{ salonId: string; salonName: string; revenue: number }>;
    trends: { bookingsTodayVsLastMonth: number; monthlyRevenueVsLastMonth: number };
  }> {
    const now = new Date();

    // Today bounds (UTC date string matching appointmentDate storage)
    const todayStr = now.toISOString().split('T')[0];
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const todayEnd   = new Date(`${todayStr}T23:59:59.999Z`);

    // This month bounds
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    // Last month bounds (for trends)
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastMonthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

    // Same day last month (for bookingsToday trend)
    const lastMonthDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate()));
    const lastMonthDayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate(), 23, 59, 59, 999));

    const [
      bookingsToday,
      monthlyRevenueAgg,
      totalBookings,
      completedCount,
      cancelledNoShowCount,
      revenueBySlonAgg,
      lastMonthRevenueAgg,
      lastMonthDayCount,
    ] = await Promise.all([
      this.bookingModel.countDocuments({
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
      }),
      this.bookingModel.aggregate<{ total: number }>([
        { $match: { status: BookingStatus.COMPLETED, appointmentDate: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
      this.bookingModel.countDocuments({}),
      this.bookingModel.countDocuments({ status: BookingStatus.COMPLETED }),
      this.bookingModel.countDocuments({
        status: { $in: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
      }),
      this.bookingModel.aggregate<{ _id: string; salonName: string; revenue: number }>([
        { $match: { status: BookingStatus.COMPLETED, appointmentDate: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: '$salonId', salonName: { $first: '$salonName' }, revenue: { $sum: '$totalPrice' } } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        { $project: { salonId: { $toString: '$_id' }, salonName: 1, revenue: 1, _id: 0 } },
      ]),
      this.bookingModel.aggregate<{ total: number }>([
        { $match: { status: BookingStatus.COMPLETED, appointmentDate: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
      this.bookingModel.countDocuments({
        appointmentDate: { $gte: lastMonthDayStart, $lte: lastMonthDayEnd },
      }),
    ]);

    const monthlyRevenue = monthlyRevenueAgg[0]?.total ?? 0;
    const lastMonthRevenue = lastMonthRevenueAgg[0]?.total ?? 0;
    const denominator = completedCount + cancelledNoShowCount;
    const completionRate = denominator > 0 ? Math.round((completedCount / denominator) * 100) : 0;

    const revenueBySalon = (revenueBySlonAgg as Array<{ salonId?: string; _id?: string; salonName: string; revenue: number }>).map((r) => ({
      salonId:   r.salonId ?? r._id ?? '',
      salonName: r.salonName,
      revenue:   r.revenue,
    }));

    const revenueChange = lastMonthRevenue > 0
      ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 0;
    const bookingsTodayChange = lastMonthDayCount > 0
      ? Math.round(((bookingsToday - lastMonthDayCount) / lastMonthDayCount) * 100)
      : 0;

    return {
      bookingsToday,
      monthlyRevenue,
      totalBookings,
      completionRate,
      revenueBySalon,
      trends: {
        bookingsTodayVsLastMonth:   bookingsTodayChange,
        monthlyRevenueVsLastMonth:  revenueChange,
      },
    };
  }

  async countActiveBookingsForSalonOnDate(salonId: string, dateStr: string): Promise<number> {
    if (!Types.ObjectId.isValid(salonId)) {
      throw new BadRequestException('Invalid salon ID');
    }
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    return this.bookingModel.countDocuments({
      salonId: new Types.ObjectId(salonId),
      appointmentDate: { $gte: dayStart, $lte: dayEnd },
      status: {
        $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS],
      },
    });
  }

  // ── Client analytics ──────────────────────────────────────────────────────

  async getClientAnalytics(clientId: string): Promise<ClientAnalyticsResponseDto> {
    if (!Types.ObjectId.isValid(clientId)) {
      throw new BadRequestException('Invalid client ID');
    }

    const clientOid = new Types.ObjectId(clientId);
    const matchFilter = { clientId: clientOid };

    // Six months ago boundary for monthly spending
    const now = new Date();
    const sixMonthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
    );

    const [
      totalsRows,
      favoriteServiceRows,
      favoriteSalonRows,
      monthlyRows,
      lastVisitRows,
      visitDatesRows,
    ] = await Promise.all([
      // Totals: count all, sum totalPrice where COMPLETED
      this.bookingModel
        .aggregate<{
          totalBookings: number;
          totalSpent: number;
          completedCount: number;
        }>([
          { $match: matchFilter },
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              totalSpent: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', BookingStatus.COMPLETED] },
                    '$totalPrice',
                    0,
                  ],
                },
              },
              completedCount: {
                $sum: {
                  $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0],
                },
              },
            },
          },
        ])
        .exec(),

      // Favorite services: top 5 by count (unwind services array, group by name)
      this.bookingModel
        .aggregate<{ _id: string; count: number }>([
          { $match: matchFilter },
          { $unwind: '$services' },
          { $group: { _id: '$services.name', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ])
        .exec(),

      // Favorite salons: top 3 by visit count, with last service IDs
      this.bookingModel
        .aggregate<{
          _id: Types.ObjectId;
          salonName: string;
          visitCount: number;
          lastServiceIds: string[];
        }>([
          { $match: matchFilter },
          { $sort: { appointmentDate: -1 } },
          {
            $group: {
              _id: '$salonId',
              salonName: { $first: '$salonName' },
              visitCount: { $sum: 1 },
              lastServices: { $first: '$services' },
            },
          },
          { $sort: { visitCount: -1 } },
          { $limit: 3 },
          {
            $project: {
              salonName: 1,
              visitCount: 1,
              lastServiceIds: {
                $map: {
                  input: '$lastServices',
                  as: 's',
                  in: { $toString: '$$s.serviceId' },
                },
              },
            },
          },
        ])
        .exec(),

      // Monthly spending: last 6 months, grouped by month
      this.bookingModel
        .aggregate<{ _id: string; total: number }>([
          {
            $match: {
              ...matchFilter,
              status: BookingStatus.COMPLETED,
              appointmentDate: { $gte: sixMonthsAgo },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m',
                  date: '$appointmentDate',
                  timezone: 'UTC',
                },
              },
              total: { $sum: '$totalPrice' },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .exec(),

      // Last visit: most recent completed booking date
      this.bookingModel
        .aggregate<{ lastVisit: Date }>([
          { $match: { ...matchFilter, status: BookingStatus.COMPLETED } },
          { $sort: { appointmentDate: -1 } },
          { $limit: 1 },
          { $project: { lastVisit: '$appointmentDate' } },
        ])
        .exec(),

      // All booking dates (for visit frequency calculation)
      this.bookingModel
        .aggregate<{ d: Date }>([
          { $match: matchFilter },
          { $sort: { appointmentDate: 1 } },
          { $project: { d: '$appointmentDate' } },
        ])
        .exec(),
    ]);

    const totals = totalsRows[0];
    const totalBookings = totals?.totalBookings ?? 0;
    const totalSpent = totals?.totalSpent ?? 0;
    const completedCount = totals?.completedCount ?? 0;
    const averageBookingValue =
      completedCount > 0 ? totalSpent / completedCount : 0;

    // Visit frequency: average days between consecutive bookings
    let visitFrequency = 0;
    if (visitDatesRows.length > 1) {
      let totalDays = 0;
      for (let i = 1; i < visitDatesRows.length; i++) {
        const diff =
          new Date(visitDatesRows[i].d).getTime() -
          new Date(visitDatesRows[i - 1].d).getTime();
        totalDays += diff / (1000 * 60 * 60 * 24);
      }
      visitFrequency = Math.round(totalDays / (visitDatesRows.length - 1));
    }

    const favoriteServices = favoriteServiceRows.map((r) => ({
      serviceName: r._id,
      count: r.count,
    }));

    const favoriteSalons = favoriteSalonRows.map((r) => ({
      salonId: r._id.toString(),
      salonName: r.salonName || 'Unknown Salon',
      visitCount: r.visitCount,
      lastServiceIds: r.lastServiceIds ?? [],
    }));

    // Fill in missing months with 0
    const monthlyMap = new Map(
      monthlyRows.map((r) => [r._id, r.total]),
    );
    const monthlySpending: ClientAnalyticsResponseDto['monthlySpending'] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
      );
      const key = d.toISOString().substring(0, 7); // YYYY-MM
      monthlySpending.push({ month: key, total: monthlyMap.get(key) ?? 0 });
    }

    const lastVisit =
      lastVisitRows[0]?.lastVisit
        ? new Date(lastVisitRows[0].lastVisit).toISOString()
        : null;

    return {
      totalBookings,
      totalSpent,
      averageBookingValue,
      visitFrequency,
      favoriteServices,
      favoriteSalons,
      monthlySpending,
      lastVisit,
    };
  }

  private enumerateDateStrings(fromStr: string, toStr: string): string[] {
    const out: string[] = [];
    const cur = new Date(`${fromStr}T12:00:00.000Z`);
    const end = new Date(`${toStr}T12:00:00.000Z`);
    while (cur.getTime() <= end.getTime()) {
      out.push(cur.toISOString().split('T')[0]);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
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
    const appointmentDateStr = booking.appointmentDate.toISOString().split('T')[0];
    try {
      await this.invalidateSlotCache(
        booking.salonId.toString(),
        appointmentDateStr,
      );
    } catch (err) {
      // Cache invalidation errors are non-fatal
      this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
    }

    // Notify waitlisted clients whose preferred window overlaps the freed slot
    await this.checkWaitlistOnCancellation(
      booking.salonId.toString(),
      appointmentDateStr,
      booking.startTime,
      booking.endTime,
    );

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

  async modifyBooking(
    bookingId: string,
    dto: ModifyBookingDto,
    clientId: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    if (booking.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only modify your own bookings');
    }

    const modifiable: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
    if (!modifiable.includes(booking.status)) {
      throw new BadRequestException(
        `Only PENDING or CONFIRMED bookings can be modified (current: ${booking.status})`,
      );
    }

    const appointmentDateStr = booking.appointmentDate.toISOString().split('T')[0];

    // ── Services change ───────────────────────────────────────────────────
    if (dto.services && dto.services.length > 0) {
      if (dto.services.length === 0) {
        throw new BadRequestException('At least one service is required');
      }

      const newDuration = dto.services.reduce((acc, s) => acc + s.durationMinutes, 0);
      const newEndTime = addMinutes(booking.startTime, newDuration);
      const newTotalPrice = dto.services.reduce((acc, s) => acc + s.price, 0);

      // Verify new endTime is within salon operating hours
      const salonServiceUrl = this.configService.get<string>(
        'services.salonUrl',
        'http://salon-service:3001',
      );

      let salon: SalonResponse;
      try {
        const { data } = await firstValueFrom(
          this.httpService.get<SalonResponse>(
            `${salonServiceUrl}/api/salons/${booking.salonId.toString()}`,
          ),
        );
        salon = data;
      } catch (err) {
        this.logger.error(`Failed to fetch salon during modify: ${(err as Error).message}`);
        throw new BadRequestException('Could not verify salon operating hours');
      }

      const dayOfWeek = new Date(`${appointmentDateStr}T12:00:00.000Z`).getUTCDay();
      const hours = salon.operatingHours?.find((h) => h.day === dayOfWeek);
      if (!hours || hours.closed) {
        throw new BadRequestException('The salon is closed on this day');
      }

      const closeMin = toMinutes(hours.close);
      if (toMinutes(newEndTime) > closeMin) {
        throw new BadRequestException(
          `The new end time ${newEndTime} exceeds salon closing time ${hours.close}`,
        );
      }

      // Verify no slot conflicts (exclude current booking)
      const appointmentDate = new Date(`${appointmentDateStr}T00:00:00.000Z`);

      if (booking.stylistId) {
        const clash = await this.bookingModel.findOne({
          salonId: booking.salonId,
          appointmentDate,
          status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          _id: { $ne: booking._id },
          stylistId: booking.stylistId,
          startTime: { $lt: newEndTime },
          endTime: { $gt: booking.startTime },
        });
        if (clash) {
          throw new BadRequestException(
            `The updated duration creates a conflict with another booking (${booking.startTime}–${newEndTime})`,
          );
        }
      }

      booking.services = dto.services.map((s) => ({
        ...s,
        serviceId: new Types.ObjectId(s.serviceId),
      }));
      booking.endTime = newEndTime;
      booking.totalPrice = newTotalPrice;
    }

    // ── Stylist change ────────────────────────────────────────────────────
    if (dto.stylistId !== undefined) {
      const newStylistOid = dto.stylistId ? new Types.ObjectId(dto.stylistId) : null;

      if (dto.stylistId) {
        const appointmentDate = new Date(`${appointmentDateStr}T00:00:00.000Z`);
        const currentEndTime = booking.endTime; // may have been updated above

        // Check for booking clash with new stylist
        const clash = await this.bookingModel.findOne({
          salonId: booking.salonId,
          appointmentDate,
          status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          _id: { $ne: booking._id },
          stylistId: newStylistOid,
          startTime: { $lt: currentEndTime },
          endTime: { $gt: booking.startTime },
        });
        if (clash) {
          throw new BadRequestException(
            `The selected stylist is not available during ${booking.startTime}–${currentEndTime}`,
          );
        }

        // Check for break conflict
        const breakConflict = await this.breakModel.findOne({
          stylistId: newStylistOid,
          date: appointmentDate,
          startTime: { $lt: currentEndTime },
          endTime: { $gt: booking.startTime },
        });
        if (breakConflict) {
          throw new BadRequestException(
            `The selected stylist is on a break from ${breakConflict.startTime} to ${breakConflict.endTime}`,
          );
        }

        try {
          booking.stylistName = await this.fetchStylistName(dto.stylistId);
        } catch {
          /* non-fatal */
        }
      } else {
        booking.stylistName = '';
      }

      booking.stylistId = newStylistOid as Types.ObjectId | null;
    }

    // ── Notes change ──────────────────────────────────────────────────────
    if (dto.notes !== undefined) {
      booking.notes = dto.notes || null;
    }

    await booking.save();

    const response = this.toResponse(booking);
    await this.bookingQueue.add(BookingEvent.MODIFIED, response);

    try {
      await this.invalidateSlotCache(
        booking.salonId.toString(),
        appointmentDateStr,
      );
    } catch (err) {
      this.logger.warn(`Cache invalidation failed after modify: ${(err as Error).message}`);
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

  async markNoShow(bookingId: string): Promise<BookingResponseDto> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Only CONFIRMED or IN_PROGRESS bookings can be marked as no-show (current: ${booking.status})`,
      );
    }

    booking.status = BookingStatus.NO_SHOW;
    await booking.save();

    const response = this.toResponse(booking);
    await this.bookingQueue.add(BookingEvent.NO_SHOW, response).catch(() => {/* non-fatal */});

    try {
      await this.invalidateSlotCache(
        booking.salonId.toString(),
        booking.appointmentDate.toISOString().split('T')[0],
      );
    } catch { /* non-fatal */ }

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
      isManualBooking: booking.isManualBooking ?? false,
      cancelledBy: booking.cancelledBy ?? undefined,
      cancellationReason: booking.cancellationReason ?? undefined,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  // ── Waitlist ──────────────────────────────────────────────────────────────

  /**
   * Add a client to the waitlist for a fully-booked time slot.
   * Validates that the slot is actually full before creating the entry,
   * and rejects duplicate entries for the same client/salon/date/time.
   */
  async joinWaitlist(
    dto: JoinWaitlistDto,
    clientId: string,
  ): Promise<WaitlistEntryResponseDto> {
    const totalDuration = dto.services.reduce((acc, s) => acc + s.durationMinutes, 0);
    const endTime = dto.preferredEndTime ?? addMinutes(dto.preferredStartTime, totalDuration);
    const appointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);

    // Verify the requested slot is actually fully booked (prevents phantom waitlists)
    const salonServiceUrl = this.configService.get<string>('services.salonUrl', 'http://salon-service:3001');
    let stationCount = 1;
    try {
      const { data: stationsData } = await firstValueFrom(
        this.httpService.get<StationsResponse>(`${salonServiceUrl}/api/salons/${dto.salonId}/stations`),
      );
      stationCount = stationsData.stationCount || 1;
    } catch (err) {
      this.logger.warn(`Waitlist: could not fetch station count for ${dto.salonId}: ${(err as Error).message}`);
    }

    const overlappingCount = await this.bookingModel.countDocuments({
      salonId: new Types.ObjectId(dto.salonId),
      appointmentDate,
      status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
      startTime: { $lt: endTime },
      endTime: { $gt: dto.preferredStartTime },
    });

    if (overlappingCount < stationCount) {
      throw new BadRequestException(
        'This time slot still has availability. Please book directly instead of joining the waitlist.',
      );
    }

    // Prevent duplicate active waitlist entries
    const duplicate = await this.waitlistModel.findOne({
      clientId: new Types.ObjectId(clientId),
      salonId: new Types.ObjectId(dto.salonId),
      appointmentDate,
      preferredStartTime: dto.preferredStartTime,
      status: { $in: ['waiting', 'notified'] },
    });

    if (duplicate) {
      throw new BadRequestException(
        'You already have an active waitlist entry for this slot.',
      );
    }

    const entry = await this.waitlistModel.create({
      clientId: new Types.ObjectId(clientId),
      salonId: new Types.ObjectId(dto.salonId),
      appointmentDate,
      preferredStartTime: dto.preferredStartTime,
      preferredEndTime: endTime,
      stylistId: dto.stylistId ?? null,
      services: dto.services.map((s) => ({
        serviceId: new Types.ObjectId(s.serviceId),
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
      })),
    });

    return this.toWaitlistResponse(entry);
  }

  /**
   * Return all active waitlist entries for the authenticated client.
   */
  async getMyWaitlist(clientId: string): Promise<WaitlistEntryResponseDto[]> {
    const entries = await this.waitlistModel
      .find({ clientId: new Types.ObjectId(clientId), status: { $in: ['waiting', 'notified'] } })
      .sort({ appointmentDate: 1, preferredStartTime: 1 })
      .lean()
      .exec();
    return entries.map((e) => this.toWaitlistResponse(e));
  }

  /**
   * Remove a client from the waitlist (only the owning client may do this).
   */
  async leaveWaitlist(entryId: string, clientId: string): Promise<{ success: boolean }> {
    const entry = await this.waitlistModel.findById(entryId);
    if (!entry) throw new NotFoundException(`Waitlist entry ${entryId} not found`);
    if (entry.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only remove your own waitlist entries');
    }
    await entry.deleteOne();
    return { success: true };
  }

  /**
   * Called after a booking is cancelled.
   * Finds waitlist entries whose preferred window overlaps the freed slot,
   * emits 'waitlist.slot-available' to the notification queue,
   * and marks each entry as 'notified'.
   */
  async checkWaitlistOnCancellation(
    salonId: string,
    date: string,
    startTime: string,
    endTime: string,
  ): Promise<void> {
    const appointmentDate = new Date(`${date}T00:00:00.000Z`);

    // An entry overlaps the freed slot when:
    //   entry.preferredStartTime < endTime  AND  entry.preferredEndTime > startTime
    const matching = await this.waitlistModel.find({
      salonId: new Types.ObjectId(salonId),
      appointmentDate,
      status: 'waiting',
      preferredStartTime: { $lt: endTime },
      preferredEndTime: { $gt: startTime },
    }).lean().exec();

    if (matching.length === 0) return;

    // Fetch salon name for the notification payload
    const salonServiceUrl = this.configService.get<string>('services.salonUrl', 'http://salon-service:3001');
    let salonName = '';
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{ name?: string }>(`${salonServiceUrl}/api/salons/${salonId}`),
      );
      salonName = data.name ?? '';
    } catch {
      // Non-fatal — the notification processor can fall back to salonId
    }

    await Promise.allSettled(
      matching.map(async (entry) => {
        try {
          await this.bookingQueue.add(BookingEvent.WAITLIST_SLOT_AVAILABLE, {
            waitlistEntryId: entry._id.toString(),
            clientId: entry.clientId.toString(),
            salonId,
            salonName,
            date,
            startTime,
            endTime,
          });
          await this.waitlistModel.findByIdAndUpdate(entry._id, {
            status: 'notified',
            notifiedAt: new Date(),
          });
        } catch (err) {
          this.logger.warn(
            `Failed to notify waitlist entry ${entry._id.toString()}: ${(err as Error).message}`,
          );
        }
      }),
    );
  }

  /**
   * Nightly cron: expire waitlist entries whose appointment date has passed.
   */
  @Cron('0 0 * * *', { name: 'expireWaitlistEntries' })
  async expireWaitlistEntries(): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const result = await this.waitlistModel.updateMany(
      {
        appointmentDate: { $lt: today },
        status: { $in: ['waiting', 'notified'] },
      },
      { status: 'expired' },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`[WaitlistCron] Expired ${result.modifiedCount} waitlist entries`);
    }
  }

  private toWaitlistResponse(entry: any): WaitlistEntryResponseDto {
    return {
      id: entry._id?.toString(),
      clientId: entry.clientId?.toString(),
      salonId: entry.salonId?.toString(),
      appointmentDate: entry.appointmentDate instanceof Date
        ? entry.appointmentDate.toISOString().split('T')[0]
        : String(entry.appointmentDate),
      preferredStartTime: entry.preferredStartTime,
      preferredEndTime: entry.preferredEndTime,
      stylistId: entry.stylistId ?? null,
      services: (entry.services ?? []).map((s: any) => ({
        serviceId: s.serviceId?.toString(),
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
      })),
      status: entry.status,
      notifiedAt: entry.notifiedAt ? new Date(entry.notifiedAt).toISOString() : null,
      createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString(),
    };
  }
}


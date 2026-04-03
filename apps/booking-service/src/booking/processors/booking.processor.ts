import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bull';
import { firstValueFrom } from 'rxjs';
import { BOOKING_QUEUE, BookingEvent } from '../constants/booking-events.constants';
import { BookingResponseDto } from '../dto/booking-response.dto';

const NOTIFICATION_QUEUE = 'notifications';
const CALENDAR_QUEUE = 'calendar';

interface RecipientInfo {
  name: string;
  email: string;
  phone: string;
}

interface BookingNotificationPayload {
  booking: BookingResponseDto;
  client: RecipientInfo;
  salonOwner: RecipientInfo;
  salonOwnerId: string;
  salonName: string;
  salonAddress: string;
  /** Assigned stylist info — only present when booking has a specific stylist */
  stylist?: RecipientInfo;
  stylistId?: string;
  stylistName?: string;
}

@Processor(BOOKING_QUEUE)
export class BookingProcessor {
  private readonly logger = new Logger(BookingProcessor.name);
  private readonly authUrl: string;
  private readonly salonUrl: string;
  private readonly apiGatewayUrl: string;
  private readonly internalToken: string | undefined;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectQueue(BOOKING_QUEUE) private readonly bookingQueue: Queue,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue: Queue,
    @InjectQueue(CALENDAR_QUEUE) private readonly calendarQueue: Queue,
  ) {
    this.authUrl = this.configService.get<string>(
      'services.authUrl',
      'http://localhost:3003',
    );
    this.salonUrl = this.configService.get<string>(
      'services.salonUrl',
      'http://localhost:3001',
    );
    this.apiGatewayUrl = this.configService.get<string>(
      'services.apiGatewayUrl',
      'http://localhost:3000',
    );
    this.internalToken = this.configService.get<string>('internalToken');
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  @Process(BookingEvent.CREATED)
  async handleBookingCreated(job: Job<BookingResponseDto>): Promise<void> {
    this.logger.log(
      `[${BookingEvent.CREATED}] bookingId=${job.data.id} salonId=${job.data.salonId}`,
    );

    const payload = await this.buildNotificationPayload(job.data);
    if (payload) {
      try {
        await this.notifQueue.add('booking.created', payload);
        this.logger.log(
          `[${BookingEvent.CREATED}] Notification queued for bookingId=${job.data.id}`,
        );
      } catch (err) {
        this.logger.warn(
          `[${BookingEvent.CREATED}] Failed to queue notification for bookingId=${job.data.id}: ${(err as Error).message}`,
        );
      }
      // SSE push is handled by the notification-service's BookingCreatedProcessor
      // after it consumes the queued notification job — no need to push here.
    }
  }

  @Process(BookingEvent.CONFIRMED)
  async handleBookingConfirmed(job: Job<BookingResponseDto>): Promise<void> {
    this.logger.log(
      `[${BookingEvent.CONFIRMED}] bookingId=${job.data.id}`,
    );

    // Notification
    const payload = await this.buildNotificationPayload(job.data);
    if (payload) {
      try {
        await this.notifQueue.add('booking.confirmed', payload);
        this.logger.log(
          `[${BookingEvent.CONFIRMED}] Notification queued for bookingId=${job.data.id}`,
        );
      } catch (err) {
        this.logger.warn(
          `[${BookingEvent.CONFIRMED}] Failed to queue notification for bookingId=${job.data.id}: ${(err as Error).message}`,
        );
      }
    }

    // Calendar event creation — send enriched payload so the calendar
    // processor has both the booking and the client/salon information it needs.
    if (payload) {
      try {
        await this.calendarQueue.add('calendar.event.create', payload);
        this.logger.log(
          `[${BookingEvent.CONFIRMED}] Calendar event queued for bookingId=${job.data.id}`,
        );
      } catch (err) {
        this.logger.warn(
          `[${BookingEvent.CONFIRMED}] Failed to queue calendar event for bookingId=${job.data.id}: ${(err as Error).message}`,
        );
      }
    }

    // Schedule reminders on the notifications queue where
    // ReminderNotificationProcessor is listening.
    // Explicitly anchor to Sri Lanka time (UTC+5:30) so delay calculations
    // are correct regardless of the server's local timezone.
    if (payload) {
      const dateStr = new Date(job.data.appointmentDate).toISOString().split('T')[0];
      const appointmentDateTime = new Date(`${dateStr}T${job.data.startTime}:00+05:30`);
      const timeUntilDate = appointmentDateTime.getTime() - Date.now();

      const delay24hr = timeUntilDate - 24 * 60 * 60 * 1000;
      if (delay24hr > 0) {
        await this.notifQueue.add('booking.reminder.24hr', payload, {
          delay: delay24hr,
          attempts: 3,
        });
        this.logger.log(
          `[${BookingEvent.CONFIRMED}] Scheduled 24hr reminder for bookingId=${job.data.id}`,
        );
      }

      const delay2hr = timeUntilDate - 2 * 60 * 60 * 1000;
      if (delay2hr > 0) {
        await this.notifQueue.add('booking.reminder.2hr', payload, {
          delay: delay2hr,
          attempts: 3,
        });
        this.logger.log(
          `[${BookingEvent.CONFIRMED}] Scheduled 2hr reminder for bookingId=${job.data.id}`,
        );
      }
    }
  }

  @Process(BookingEvent.CANCELLED)
  async handleBookingCancelled(
    job: Job<{ booking: BookingResponseDto; reason: string }>,
  ): Promise<void> {
    this.logger.log(
      `[${BookingEvent.CANCELLED}] bookingId=${job.data.booking.id} reason="${job.data.reason}"`,
    );

    // Notification
    const payload = await this.buildNotificationPayload(job.data.booking);
    if (payload) {
      try {
        await this.notifQueue.add('booking.cancelled', {
          ...payload,
          booking: {
            ...payload.booking,
            cancellationReason: job.data.reason ?? payload.booking.cancellationReason,
          },
        });
        this.logger.log(
          `[${BookingEvent.CANCELLED}] Notification queued for bookingId=${job.data.booking.id}`,
        );
      } catch (err) {
        this.logger.warn(
          `[${BookingEvent.CANCELLED}] Failed to queue notification for bookingId=${job.data.booking.id}: ${(err as Error).message}`,
        );
      }
    }

    // Calendar event deletion
    if (job.data.booking.googleEventId && payload) {
      try {
        await this.calendarQueue.add('calendar.event.delete', {
          ...payload,
          booking: {
            ...payload.booking,
            cancellationReason: job.data.reason ?? payload.booking.cancellationReason,
          },
        });
        this.logger.log(
          `[${BookingEvent.CANCELLED}] Calendar event delete queued for bookingId=${job.data.booking.id}`,
        );
      } catch (err) {
        this.logger.warn(
          `[${BookingEvent.CANCELLED}] Failed to queue calendar event delete for bookingId=${job.data.booking.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  @Process(BookingEvent.COMPLETED)
  async handleBookingCompleted(job: Job<BookingResponseDto>): Promise<void> {
    this.logger.log(
      `[${BookingEvent.COMPLETED}] bookingId=${job.data.id}`,
    );

    const payload = await this.buildNotificationPayload(job.data);
    if (payload) {
      try {
        await this.notifQueue.add('booking.completed', payload);
        this.logger.log(
          `[${BookingEvent.COMPLETED}] Notification queued for bookingId=${job.data.id}`,
        );
      } catch (err) {
        this.logger.warn(
          `[${BookingEvent.COMPLETED}] Failed to queue notification for bookingId=${job.data.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async buildNotificationPayload(
    booking: BookingResponseDto,
  ): Promise<BookingNotificationPayload | null> {
    try {
      const fetches: [Promise<RecipientInfo>, Promise<{ owner: RecipientInfo; ownerId: string; name: string; address: string }>, Promise<RecipientInfo | null>] = [
        this.fetchClient(booking.clientId),
        this.fetchSalon(booking.salonId),
        booking.stylistId ? this.fetchStylist(booking.stylistId) : Promise.resolve(null),
      ];

      const [client, salonData, stylist] = await Promise.all(fetches);

      const payload: BookingNotificationPayload = {
        booking,
        client,
        salonOwner: salonData.owner,
        salonOwnerId: salonData.ownerId,
        salonName: salonData.name,
        salonAddress: salonData.address,
      };

      // Include stylist info if the booking has an assigned stylist
      if (booking.stylistId && stylist) {
        payload.stylist = stylist;
        payload.stylistId = booking.stylistId;
        payload.stylistName = booking.stylistName ?? stylist.name;
      }

      return payload;
    } catch (err) {
      this.logger.warn(
        `Failed to build notification payload for bookingId=${booking.id}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Fetch any user by ID from auth-service (reused for client, owner, stylist). */
  private async fetchUserById(userId: string): Promise<RecipientInfo> {
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.authUrl}/api/auth/users/${userId}`, {
        headers: { 'x-internal-token': this.internalToken ?? '' },
      }),
    );
    return {
      name: data.name ?? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim(),
      email: data.email ?? '',
      phone: data.phone ?? '',
    };
  }

  private async fetchClient(clientId: string): Promise<RecipientInfo> {
    try {
      return await this.fetchUserById(clientId);
    } catch (err) {
      this.logger.warn(`Could not fetch client ${clientId}: ${(err as Error).message}`);
      return { name: 'Unknown', email: '', phone: '' };
    }
  }

  private async fetchStylist(stylistId: string): Promise<RecipientInfo | null> {
    try {
      return await this.fetchUserById(stylistId);
    } catch (err) {
      this.logger.warn(`Could not fetch stylist ${stylistId}: ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchSalon(
    salonId: string,
  ): Promise<{ owner: RecipientInfo; ownerId: string; name: string; address: string }> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.salonUrl}/api/salons/${salonId}`),
      );

      const ownerId: string = data.ownerId ?? '';

      // Resolve a human-readable address string from the address object or raw string.
      const addr = data.address;
      const address: string =
        addr && typeof addr === 'object'
          ? [addr.street, addr.city, addr.state].filter(Boolean).join(', ')
          : (addr ?? '');

      // The salon API exposes ownerId but NOT the owner's personal contact details.
      // Fetch those from auth-service so emails reach the owner's real inbox.
      let owner: RecipientInfo = {
        name: 'Salon Owner',
        email: data.email ?? '',   // fallback: salon contact email
        phone: data.phone ?? '',
      };
      if (ownerId) {
        try {
          owner = await this.fetchUserById(ownerId);
        } catch {
          // Non-fatal: keep the salon contact email as fallback.
          this.logger.warn(`Could not fetch owner profile for ownerId=${ownerId}; falling back to salon email`);
        }
      }

      return { owner, ownerId, name: data.name ?? '', address };
    } catch (err) {
      this.logger.warn(`Could not fetch salon ${salonId}: ${(err as Error).message}`);
      return {
        owner: { name: 'Salon Owner', email: '', phone: '' },
        ownerId: '',
        name: '',
        address: '',
      };
    }
  }

  private async pushSseToOwner(
    salonOwnerId: string,
    booking: BookingResponseDto,
  ): Promise<void> {
    if (!salonOwnerId) {
      this.logger.warn(
        `[SSE] salonOwnerId not available for bookingId=${booking.id} — skipping push`,
      );
      return;
    }

    if (!this.internalToken) {
      this.logger.warn('[SSE] INTERNAL_TOKEN not configured — skipping SSE push');
      return;
    }

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.apiGatewayUrl}/api/notifications/push`,
          {
            userId: salonOwnerId,
            event:  'booking.new',
            data: {
              bookingId:       booking.id,
              clientName:      booking.clientName,
              serviceName:     booking.serviceName,
              startTime:       booking.startTime,
              appointmentDate: booking.appointmentDate,
            },
          },
          {
            headers: { 'x-internal-token': this.internalToken },
          },
        ),
      );
      this.logger.log(
        `[SSE] Pushed booking.new to owner ${salonOwnerId} for bookingId=${booking.id}`,
      );
    } catch (err) {
      // Non-fatal: owner may not have an active SSE connection.
      this.logger.warn(
        `[SSE] Failed to push booking.new to owner ${salonOwnerId}: ${(err as Error).message}`,
      );
    }
  }

  private async pushSseToStylist(
    stylistId: string,
    booking: BookingResponseDto,
  ): Promise<void> {
    if (!stylistId) {
      return;
    }

    if (!this.internalToken) {
      this.logger.warn('[SSE] INTERNAL_TOKEN not configured — skipping stylist SSE push');
      return;
    }

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.apiGatewayUrl}/api/notifications/push`,
          {
            userId: stylistId,
            event:  'booking.new.stylist',
            data: {
              bookingId:       booking.id,
              clientName:      booking.clientName,
              serviceName:     booking.serviceName,
              startTime:       booking.startTime,
              appointmentDate: booking.appointmentDate,
              salonName:       booking.salonName,
            },
          },
          {
            headers: { 'x-internal-token': this.internalToken },
          },
        ),
      );
      this.logger.log(
        `[SSE] Pushed booking.new.stylist to stylist ${stylistId} for bookingId=${booking.id}`,
      );
    } catch (err) {
      // Non-fatal: stylist may not have an active SSE connection.
      this.logger.warn(
        `[SSE] Failed to push booking.new.stylist to stylist ${stylistId}: ${(err as Error).message}`,
      );
    }
  }
}

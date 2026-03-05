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
  salonName: string;
  salonAddress: string;
}

@Processor(BOOKING_QUEUE)
export class BookingProcessor {
  private readonly logger = new Logger(BookingProcessor.name);
  private readonly authUrl: string;
  private readonly salonUrl: string;

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

    // Calendar event creation
    try {
      await this.calendarQueue.add('calendar.event.create', job.data);
      this.logger.log(
        `[${BookingEvent.CONFIRMED}] Calendar event queued for bookingId=${job.data.id}`,
      );
    } catch (err) {
      this.logger.warn(
        `[${BookingEvent.CONFIRMED}] Failed to queue calendar event for bookingId=${job.data.id}: ${(err as Error).message}`,
      );
    }

    // Schedule reminders
    // Explicitly anchor to Sri Lanka time (UTC+5:30) so delay calculations
    // are correct regardless of the server's local timezone.
    const dateStr = new Date(job.data.appointmentDate).toISOString().split('T')[0];
    const appointmentDateTime = new Date(`${dateStr}T${job.data.startTime}:00+05:30`);
    const timeUntilDate = appointmentDateTime.getTime() - Date.now();

    const delay24hr = timeUntilDate - 24 * 60 * 60 * 1000;
    if (delay24hr > 0) {
      await this.bookingQueue.add('booking.reminder.24hr', job.data, {
        delay: delay24hr,
        attempts: 3,
      });
      this.logger.log(
        `[${BookingEvent.CONFIRMED}] Scheduled 24hr reminder for bookingId=${job.data.id}`,
      );
    }

    const delay2hr = timeUntilDate - 2 * 60 * 60 * 1000;
    if (delay2hr > 0) {
      await this.bookingQueue.add('booking.reminder.2hr', job.data, {
        delay: delay2hr,
        attempts: 3,
      });
      this.logger.log(
        `[${BookingEvent.CONFIRMED}] Scheduled 2hr reminder for bookingId=${job.data.id}`,
      );
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
    if (job.data.booking.googleEventId) {
      try {
        await this.calendarQueue.add('calendar.event.delete', {
          googleEventId: job.data.booking.googleEventId,
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
      const [client, salonData] = await Promise.all([
        this.fetchClient(booking.clientId),
        this.fetchSalon(booking.salonId),
      ]);

      return {
        booking,
        client,
        salonOwner: salonData.owner,
        salonName: salonData.name,
        salonAddress: salonData.address,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to build notification payload for bookingId=${booking.id}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async fetchClient(clientId: string): Promise<RecipientInfo> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.authUrl}/api/auth/users/${clientId}`),
      );
      return {
        name: data.name ?? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim(),
        email: data.email ?? '',
        phone: data.phone ?? '',
      };
    } catch (err) {
      this.logger.warn(`Could not fetch client ${clientId}: ${(err as Error).message}`);
      return { name: 'Unknown', email: '', phone: '' };
    }
  }

  private async fetchSalon(
    salonId: string,
  ): Promise<{ owner: RecipientInfo; name: string; address: string }> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.salonUrl}/api/salons/${salonId}`),
      );
      return {
        owner: {
          name: data.ownerName ?? data.owner?.name ?? 'Salon Owner',
          email: data.ownerEmail ?? data.owner?.email ?? '',
          phone: data.ownerPhone ?? data.owner?.phone ?? '',
        },
        name: data.name ?? '',
        address: data.address ?? '',
      };
    } catch (err) {
      this.logger.warn(`Could not fetch salon ${salonId}: ${(err as Error).message}`);
      return {
        owner: { name: 'Salon Owner', email: '', phone: '' },
        name: '',
        address: '',
      };
    }
  }
}

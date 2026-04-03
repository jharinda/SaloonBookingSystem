import { Inject, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { firstValueFrom } from 'rxjs';

import {
  BOOKING_QUEUE,
  NotificationEvent,
  TemplateType,
} from '../constants/notification-events.constants';
import {
  IPushNotificationService,
  PUSH_NOTIFICATION_SERVICE,
} from '../interfaces/notification-channel.interface';
import { NotificationDispatchService } from '../notification-dispatch.service';

/** Shape of the job payload emitted by booking-service for waitlist.slot-available */
export interface WaitlistSlotAvailablePayload {
  waitlistEntryId: string;
  clientId: string;
  salonId: string;
  salonName: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
}

interface ClientInfo {
  email: string;
  firstName: string;
  lastName: string;
}

@Processor(BOOKING_QUEUE)
export class WaitlistNotificationProcessor {
  private readonly logger = new Logger(WaitlistNotificationProcessor.name);

  private readonly authUrl: string;
  private readonly webUrl: string;

  constructor(
    private readonly dispatch: NotificationDispatchService,
    @Inject(PUSH_NOTIFICATION_SERVICE)
    private readonly pushNotification: IPushNotificationService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.authUrl = this.configService.get<string>('services.authUrl', 'http://localhost:3003');
    this.webUrl = this.configService.get<string>('services.webUrl', 'https://snapsalon.lk');
  }

  @Process(NotificationEvent.WAITLIST_SLOT_AVAILABLE)
  async handleWaitlistSlotAvailable(job: Job<WaitlistSlotAvailablePayload>): Promise<void> {
    const { clientId, salonId, salonName, date, startTime } = job.data;

    this.logger.log(
      `[${NotificationEvent.WAITLIST_SLOT_AVAILABLE}] clientId=${clientId} salonId=${salonId} date=${date} time=${startTime}`,
    );

    // Resolve client email and name
    let client: ClientInfo | null = null;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<ClientInfo>(`${this.authUrl}/api/auth/users/${clientId}`),
      );
      client = data;
    } catch (err) {
      this.logger.warn(
        `[${NotificationEvent.WAITLIST_SLOT_AVAILABLE}] Could not fetch client ${clientId}: ${(err as Error).message}`,
      );
    }

    if (!client?.email) {
      this.logger.warn(
        `[${NotificationEvent.WAITLIST_SLOT_AVAILABLE}] No email for client ${clientId} — skipping email`,
      );
    }

    const formattedDate = new Date(`${date}T12:00:00.000Z`).toLocaleDateString('en-LK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const clientName = client ? `${client.firstName} ${client.lastName}`.trim() : '';
    const bookingUrl = `${this.webUrl}/book/${salonId}`;

    // ── Email ──────────────────────────────────────────────────────────────
    if (client?.email) {
      await this.dispatch.sendEmail(
        NotificationEvent.WAITLIST_SLOT_AVAILABLE,
        TemplateType.WAITLIST_SLOT_AVAILABLE,
        client.email,
        {
          clientName,
          salonName: salonName || salonId,
          date: formattedDate,
          time: startTime,
          bookingUrl,
        },
        job.data.waitlistEntryId,
        clientId,
      ).catch((err) =>
        this.logger.warn(
          `[${NotificationEvent.WAITLIST_SLOT_AVAILABLE}] Email failed for ${clientId}: ${(err as Error).message}`,
        ),
      );
    }

    // ── Push notification ──────────────────────────────────────────────────
    await this.pushNotification
      .sendToUser(
        clientId,
        'A slot opened up!',
        `Good news! A slot opened at ${salonName || 'the salon'} on ${formattedDate} at ${startTime}. Book now before it's gone!`,
        {
          event: NotificationEvent.WAITLIST_SLOT_AVAILABLE,
          waitlistEntryId: job.data.waitlistEntryId,
          salonId,
          date,
          startTime,
          deepLink: bookingUrl,
        },
      )
      .catch((err) =>
        this.logger.warn(
          `[${NotificationEvent.WAITLIST_SLOT_AVAILABLE}] Push failed for ${clientId}: ${(err as Error).message}`,
        ),
      );

    // ── In-app inbox ───────────────────────────────────────────────────────
    await this.dispatch
      .saveToInbox(
        clientId,
        '🎉 A slot opened up!',
        `Good news! A slot opened at ${salonName || 'your waitlisted salon'} on ${formattedDate} at ${startTime}. Book now!`,
        NotificationEvent.WAITLIST_SLOT_AVAILABLE,
        { salonId, date, startTime, deepLink: bookingUrl },
      )
      .catch((err) =>
        this.logger.warn(
          `[${NotificationEvent.WAITLIST_SLOT_AVAILABLE}] Inbox save failed for ${clientId}: ${(err as Error).message}`,
        ),
      );
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `[${WaitlistNotificationProcessor.name}] job ${job.id} (${job.name}) failed: ${err.message}`,
    );
  }
}

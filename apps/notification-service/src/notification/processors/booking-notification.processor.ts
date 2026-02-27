import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bull';

import {
  BOOKING_QUEUE,
  NotificationChannel,
  NotificationEvent,
  TemplateType,
} from '../constants/notification-events.constants';
import { BookingNotificationPayload } from '../interfaces/notification-payload.interface';
import { EmailService } from '../providers/email.service';
import { SmsService } from '../providers/sms.service';
import { WhatsAppService } from '../providers/whatsapp.service';
import { TemplateService, TemplateVariables } from '../template.service';
import { NotificationStatus } from '../schemas/notification-log.schema';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

@Processor(BOOKING_QUEUE)
export class BookingNotificationProcessor {
  private readonly logger = new Logger(BookingNotificationProcessor.name);

  constructor(
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly whatsApp: WhatsAppService,
    private readonly templates: TemplateService,
    private readonly config: ConfigService,
    @InjectQueue(BOOKING_QUEUE)
    private readonly bookingQueue: Queue,
  ) {}

  // ── booking.created ────────────────────────────────────────────────────────

  @Process(NotificationEvent.BOOKING_CREATED)
  async handleBookingCreated(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonOwner, salonName, salonAddress } = job.data;

    const vars: TemplateVariables = {
      salonName,
      address: salonAddress,
      serviceName: booking.services.map((s) => s.name).join(', '),
      date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
      time: booking.startTime,
      totalPrice: booking.totalPrice.toFixed(2),
    };

    // ── Client notifications ─────────────────────────────────────────────
    await Promise.allSettled([
      this.sendEmail(
        NotificationEvent.BOOKING_CREATED,
        TemplateType.BOOKING_CREATED,
        client.email,
        { ...vars, clientName: client.name },
        booking.id,
      ),
      this.sendWhatsApp(
        TemplateType.BOOKING_CREATED,
        client.phone,
        { ...vars, clientName: client.name },
        booking.id,
      ),
    ]);

    // ── Salon-owner notifications ────────────────────────────────────────
    await Promise.allSettled([
      this.sendEmail(
        NotificationEvent.BOOKING_CREATED,
        TemplateType.BOOKING_CREATED,
        salonOwner.email,
        { ...vars, clientName: salonOwner.name },
        booking.id,
      ),
      this.sendWhatsApp(
        TemplateType.BOOKING_CREATED,
        salonOwner.phone,
        { ...vars, clientName: salonOwner.name },
        booking.id,
      ),
    ]);
  }

  // ── booking.confirmed ──────────────────────────────────────────────────────

  @Process(NotificationEvent.BOOKING_CONFIRMED)
  async handleBookingConfirmed(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonName, salonAddress } = job.data;

    const vars: TemplateVariables = {
      clientName: client.name,
      salonName,
      address: salonAddress,
      serviceName: booking.services.map((s) => s.name).join(', '),
      date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
      time: booking.startTime,
      totalPrice: booking.totalPrice.toFixed(2),
    };

    await Promise.allSettled([
      this.sendEmail(
        NotificationEvent.BOOKING_CONFIRMED,
        TemplateType.BOOKING_CONFIRMED,
        client.email,
        vars,
        booking.id,
      ),
      this.sendSms(
        TemplateType.BOOKING_CONFIRMED,
        client.phone,
        vars,
        booking.id,
      ),
    ]);
  }

  // ── booking.cancelled ──────────────────────────────────────────────────────

  @Process(NotificationEvent.BOOKING_CANCELLED)
  async handleBookingCancelled(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonOwner, salonName, salonAddress } = job.data;

    const vars: TemplateVariables = {
      salonName,
      address: salonAddress,
      serviceName: booking.services.map((s) => s.name).join(', '),
      date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
      time: booking.startTime,
      reason: booking.cancellationReason ?? 'No reason provided',
    };

    await Promise.allSettled([
      this.sendEmail(
        NotificationEvent.BOOKING_CANCELLED,
        TemplateType.BOOKING_CANCELLED,
        client.email,
        { ...vars, clientName: client.name },
        booking.id,
      ),
      this.sendEmail(
        NotificationEvent.BOOKING_CANCELLED,
        TemplateType.BOOKING_CANCELLED,
        salonOwner.email,
        { ...vars, clientName: salonOwner.name },
        booking.id,
      ),
    ]);
  }

  // ── booking.completed ─────────────────────────────────────────────────────

  /**
   * Schedules a 'booking.review.request' job with a 2-hour delay instead of
   * sending the review email immediately, so the customer has had time to leave
   * the salon before being prompted to review.
   */
  @Process(NotificationEvent.BOOKING_COMPLETED)
  async handleBookingCompleted(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    this.logger.log(
      `Scheduling review request for booking ${job.data.booking.id} in 2 hours`,
    );
    await this.bookingQueue.add(
      NotificationEvent.REVIEW_REQUEST,
      job.data,
      {
        delay: TWO_HOURS_MS,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
      },
    );
  }

  // ── booking.review.request (2-hr delayed) ─────────────────────────────────

  @Process(NotificationEvent.REVIEW_REQUEST)
  async handleBookingReviewRequest(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonName } = job.data;

    // Build a review deep-link: adjust base URL via FRONTEND_URL env var
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'https://snapsalon.lk',
    );

    const vars: TemplateVariables = {
      clientName: client.name,
      salonName,
      serviceName: booking.services.map((s) => s.name).join(', '),
      date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
      reviewLink: `${frontendUrl ?? 'https://snapsalon.lk'}/review/${booking.id}`,
    };

    await this.sendEmail(
      NotificationEvent.REVIEW_REQUEST,
      TemplateType.BOOKING_REVIEW_REQUEST,
      client.email,
      vars,
      booking.id,
    );
  }

  // ── Queue error handler ────────────────────────────────────────────────────

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Job failed | queue=${BOOKING_QUEUE} event=${job.name} id=${job.id}: ${error.message}`,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async sendEmail(
    event: string,
    type: TemplateType,
    recipient: string,
    vars: TemplateVariables,
    bookingId: string,
  ): Promise<void> {
    try {
      const { subject, body } = await this.templates.render(
        type,
        NotificationChannel.EMAIL,
        vars,
      );
      const msgId = await this.email.sendEmail({
        to: recipient,
        toName: vars.clientName ?? '',
        subject,
        html: body,
      });
      await this.templates.logNotification({
        templateType: type,
        channel: NotificationChannel.EMAIL,
        recipient,
        status: NotificationStatus.SENT,
        providerMessageId: msgId,
        error: null,
        bookingId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Email failed [${event}] → ${recipient}: ${message}`);
      await this.templates.logNotification({
        templateType: type,
        channel: NotificationChannel.EMAIL,
        recipient,
        status: NotificationStatus.FAILED,
        providerMessageId: null,
        error: message,
        bookingId,
      });
    }
  }

  private async sendSms(
    type: TemplateType,
    recipient: string,
    vars: TemplateVariables,
    bookingId: string,
  ): Promise<void> {
    try {
      const { body } = await this.templates.render(
        type,
        NotificationChannel.SMS,
        vars,
      );
      const msgId = await this.sms.sendSms({ to: recipient, message: body });
      await this.templates.logNotification({
        templateType: type,
        channel: NotificationChannel.SMS,
        recipient,
        status: NotificationStatus.SENT,
        providerMessageId: msgId,
        error: null,
        bookingId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMS failed [${type}] → ${recipient}: ${message}`);
      await this.templates.logNotification({
        templateType: type,
        channel: NotificationChannel.SMS,
        recipient,
        status: NotificationStatus.FAILED,
        providerMessageId: null,
        error: message,
        bookingId,
      });
    }
  }

  private async sendWhatsApp(
    type: TemplateType,
    recipient: string,
    vars: TemplateVariables,
    bookingId: string,
  ): Promise<void> {
    try {
      const { body } = await this.templates.render(
        type,
        NotificationChannel.WHATSAPP,
        vars,
      );
      const msgId = await this.whatsApp.sendMessage({
        to: recipient,
        message: body,
      });
      await this.templates.logNotification({
        templateType: type,
        channel: NotificationChannel.WHATSAPP,
        recipient,
        status: NotificationStatus.SENT,
        providerMessageId: msgId,
        error: null,
        bookingId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp failed [${type}] → ${recipient}: ${message}`);
      await this.templates.logNotification({
        templateType: type,
        channel: NotificationChannel.WHATSAPP,
        recipient,
        status: NotificationStatus.FAILED,
        providerMessageId: null,
        error: message,
        bookingId,
      });
    }
  }
}

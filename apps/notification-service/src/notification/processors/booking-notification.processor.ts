import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bull';
import { SubscriptionCheckService } from '@org/subscription-check';

import {
  BOOKING_QUEUE,
  NOTIFICATION_QUEUE,
  NotificationChannel,
  NotificationEvent,
  TemplateType,
} from '../constants/notification-events.constants';
import { BookingNotificationPayload } from '../interfaces/notification-payload.interface';
import { EmailService } from '../providers/email.service';
import { SmsService } from '../providers/sms.service';
import { WhatsAppService } from '../providers/whatsapp.service';
import { SsePushService } from '../providers/sse-push.service';
import { PushNotificationService } from '../providers/push-notification.service';
import { TemplateService, TemplateVariables } from '../template.service';
import { NotificationStatus } from '../schemas/notification-log.schema';
import { InboxNotificationService } from '../inbox-notification.service';
import { NotificationType } from '../schemas/inbox-notification.schema';

const TWO_HOURS_MS   = 2 * 60 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/** Parse "YYYY-MM-DD" + "HH:mm" as a local-time millisecond timestamp. */
function parseAppointmentMs(appointmentDate: string, startTime: string): number {
  const datePart = (appointmentDate ?? '').slice(0, 10);
  return new Date(`${datePart}T${startTime}:00`).getTime();
}

@Processor(BOOKING_QUEUE)
export class BookingNotificationProcessor {
  private readonly logger = new Logger(BookingNotificationProcessor.name);

  constructor(
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly whatsApp: WhatsAppService,
    private readonly templates: TemplateService,
    private readonly config: ConfigService,
    private readonly ssePush: SsePushService,
    private readonly inboxService: InboxNotificationService,
    private readonly pushNotification: PushNotificationService,
    private readonly subscriptionCheck: SubscriptionCheckService,
    @InjectQueue(BOOKING_QUEUE)
    private readonly bookingQueue: Queue,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notifQueue: Queue,
  ) {}

  // ── booking.created ────────────────────────────────────────────────────────

  @Process(NotificationEvent.BOOKING_CREATED)
  async handleBookingCreated(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonOwner, salonName, salonAddress, salonOwnerId } = job.data;

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
        booking.clientId,
      ),
      this.sendWhatsApp(
        NotificationEvent.BOOKING_CREATED,
        TemplateType.BOOKING_CREATED,
        client.phone,
        { ...vars, clientName: client.name },
        booking.id,
        booking.clientId,
        booking.salonId,
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
        salonOwnerId,
      ),
      this.sendWhatsApp(
        NotificationEvent.BOOKING_CREATED,
        TemplateType.BOOKING_CREATED,
        salonOwner.phone,
        { ...vars, clientName: salonOwner.name },
        booking.id,
        salonOwnerId,
        booking.salonId,
      ),
    ]);
    // ── SSE: push booking.new to salon owner in real-time ─────────────────────
    if (salonOwnerId) {
      await this.ssePush.push(salonOwnerId, 'booking.new', {
        bookingId:       booking.id,
        clientName:      client.name,
        serviceName:     vars['serviceName'],
        appointmentDate: vars['date'],
        startTime:       booking.startTime,
      });
    }

    // ── Schedule 15-min and now SSE reminders for the client ──────────────────
    const appointmentMs = parseAppointmentMs(booking.appointmentDate, booking.startTime);
    const now           = Date.now();
    const delay15Min    = appointmentMs - now - FIFTEEN_MIN_MS;
    const delayNow      = appointmentMs - now;
    const jobOpts = { attempts: 2, removeOnComplete: true };

    if (delay15Min > 0) {
      await this.notifQueue.add(NotificationEvent.REMINDER_15MIN, job.data, {
        ...jobOpts, delay: delay15Min,
      });
      this.logger.log(
        `Scheduled 15-min reminder for booking ${booking.id} in ${Math.round(delay15Min / 60_000)} min`,
      );
    }
    if (delayNow > 0) {
      await this.notifQueue.add(NotificationEvent.REMINDER_NOW, job.data, {
        ...jobOpts, delay: delayNow,
      });
      this.logger.log(
        `Scheduled now-reminder for booking ${booking.id} in ${Math.round(delayNow / 60_000)} min`,
      );
    }  }

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
        booking.clientId,
      ),
      this.sendSms(
        NotificationEvent.BOOKING_CONFIRMED,
        TemplateType.BOOKING_CONFIRMED,
        client.phone,
        vars,
        booking.id,
        booking.clientId,
        booking.salonId,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Booking Confirmed',
        `Your booking at ${salonName} has been confirmed for ${vars.date} at ${vars.time}.`,
        { bookingId: booking.id, event: NotificationEvent.BOOKING_CONFIRMED },
      ),
    ]);
  }

  // ── booking.cancelled ──────────────────────────────────────────────────────

  @Process(NotificationEvent.BOOKING_CANCELLED)
  async handleBookingCancelled(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonOwner, salonName, salonAddress, salonOwnerId } = job.data;

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
        booking.clientId,
      ),
      this.sendEmail(
        NotificationEvent.BOOKING_CANCELLED,
        TemplateType.BOOKING_CANCELLED,
        salonOwner.email,
        { ...vars, clientName: salonOwner.name },
        booking.id,
        salonOwnerId,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Booking Cancelled',
        `Your booking at ${salonName} for ${vars.date} at ${vars.time} has been cancelled. Reason: ${vars.reason}`,
        { bookingId: booking.id, event: NotificationEvent.BOOKING_CANCELLED },
      ),
      salonOwnerId
        ? this.pushNotification.sendToUser(
            salonOwnerId,
            'Booking Cancelled',
            `Booking by ${client.name} for ${vars.date} at ${vars.time} has been cancelled.`,
            { bookingId: booking.id, event: NotificationEvent.BOOKING_CANCELLED },
          )
        : Promise.resolve(),
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

    await Promise.allSettled([
      this.sendEmail(
        NotificationEvent.REVIEW_REQUEST,
        TemplateType.BOOKING_REVIEW_REQUEST,
        client.email,
        vars,
        booking.id,
        booking.clientId,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Review Your Experience',
        `How was your visit to ${salonName}? Share your experience with others!`,
        { bookingId: booking.id, event: NotificationEvent.REVIEW_REQUEST, reviewLink: vars.reviewLink },
      ),
    ]);
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
    userId?: string,
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

      // Save to inbox if userId provided
      if (userId) {
        await this.saveToInbox(userId, subject, body, event, { bookingId });
      }
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
    event: string,
    type: TemplateType,
    recipient: string,
    vars: TemplateVariables,
    bookingId: string,
    userId?: string,
    salonId?: string,
  ): Promise<void> {
    try {
      // Check subscription feature if salonId provided
      if (salonId) {
        const allowed = await this.subscriptionCheck.checkFeature(salonId, 'sms_notifications');
        if (!allowed) {
          this.logger.warn(
            `SMS skipped for salon ${salonId} - feature 'sms_notifications' not available in plan`,
          );
          return;
        }
      }

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

      // Save to inbox if userId provided
      if (userId) {
        const title = this.getNotificationTitle(event);
        await this.saveToInbox(userId, title, body, event, { bookingId });
      }
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
    event: string,
    type: TemplateType,
    recipient: string,
    vars: TemplateVariables,
    bookingId: string,
    userId?: string,
    salonId?: string,
  ): Promise<void> {
    try {
      // Check subscription feature if salonId provided
      if (salonId) {
        const allowed = await this.subscriptionCheck.checkFeature(salonId, 'whatsapp');
        if (!allowed) {
          this.logger.warn(
            `WhatsApp skipped for salon ${salonId} - feature 'whatsapp' not available in plan`,
          );
          return;
        }
      }

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

      // Save to inbox if userId provided
      if (userId) {
        const title = this.getNotificationTitle(event);
        await this.saveToInbox(userId, title, body, event, { bookingId });
      }
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

  /**
   * Save notification to persistent inbox storage
   */
  private async saveToInbox(
    userId: string,
    title: string,
    body: string,
    event: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const notificationType = this.mapToNotificationType(event);
      await this.inboxService.save(userId, title, body, notificationType, data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to save inbox notification for userId=${userId}: ${message}`);
      // Don't throw - inbox saving failure shouldn't break notification sending
    }
  }

  /**
   * Map NotificationEvent to NotificationType for inbox storage
   */
  private mapToNotificationType(event: string): NotificationType {
    switch (event) {
      case NotificationEvent.BOOKING_CREATED:
        return NotificationType.BOOKING_CREATED;
      case NotificationEvent.BOOKING_CONFIRMED:
        return NotificationType.BOOKING_CONFIRMED;
      case NotificationEvent.BOOKING_CANCELLED:
        return NotificationType.BOOKING_CANCELLED;
      case NotificationEvent.BOOKING_COMPLETED:
        return NotificationType.BOOKING_COMPLETED;
      case NotificationEvent.REMINDER_15MIN:
      case NotificationEvent.REMINDER_NOW:
        return NotificationType.BOOKING_REMINDER;
      case NotificationEvent.REVIEW_REQUEST:
        return NotificationType.REVIEW_REQUEST;
      default:
        return NotificationType.SYSTEM;
    }
  }

  /**
   * Generate user-friendly notification title from event
   */
  private getNotificationTitle(event: string): string {
    switch (event) {
      case NotificationEvent.BOOKING_CREATED:
        return 'Booking Created';
      case NotificationEvent.BOOKING_CONFIRMED:
        return 'Booking Confirmed';
      case NotificationEvent.BOOKING_CANCELLED:
        return 'Booking Cancelled';
      case NotificationEvent.BOOKING_COMPLETED:
        return 'Booking Completed';
      case NotificationEvent.REMINDER_15MIN:
        return 'Appointment Reminder (15 min)';
      case NotificationEvent.REMINDER_NOW:
        return 'Appointment Starting Now';
      case NotificationEvent.REVIEW_REQUEST:
        return 'Review Request';
      default:
        return 'Notification';
    }
  }
}

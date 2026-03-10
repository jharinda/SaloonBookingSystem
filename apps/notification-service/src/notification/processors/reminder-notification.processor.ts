import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import {
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

@Processor(NOTIFICATION_QUEUE)
export class ReminderNotificationProcessor {
  private readonly logger = new Logger(ReminderNotificationProcessor.name);

  constructor(
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly whatsApp: WhatsAppService,
    private readonly templates: TemplateService,
    private readonly ssePush: SsePushService,
    private readonly pushNotification: PushNotificationService,
    private readonly inboxService: InboxNotificationService,
  ) {}

  // ── booking.reminder.24hr ──────────────────────────────────────────────────

  @Process(NotificationEvent.REMINDER_24HR)
  async handleReminder24Hr(
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
        TemplateType.BOOKING_REMINDER_24HR,
        client.email,
        vars,
        booking.id,
      ),
      this.sendWhatsApp(
        TemplateType.BOOKING_REMINDER_24HR,
        client.phone,
        vars,
        booking.id,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Appointment Reminder (24 Hours)',
        `Reminder: Your appointment at ${salonName} is tomorrow at ${vars.time}.`,
        { bookingId: booking.id, event: NotificationEvent.REMINDER_24HR },
      ),
      this.inboxService.save(
        booking.clientId,
        'Appointment Reminder (24 Hours)',
        `Your appointment at ${salonName} is scheduled for ${vars.date} at ${vars.time}.`,
        NotificationType.BOOKING_REMINDER,
        { bookingId: booking.id },
      ),
    ]);
  }

  // ── booking.reminder.2hr ───────────────────────────────────────────────────

  @Process(NotificationEvent.REMINDER_2HR)
  async handleReminder2Hr(
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
    };

    await Promise.allSettled([
      this.sendSms(
        TemplateType.BOOKING_REMINDER_2HR,
        client.phone,
        vars,
        booking.id,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Appointment Reminder (2 Hours)',
        `Reminder: Your appointment at ${salonName} is in 2 hours at ${vars.time}.`,
        { bookingId: booking.id, event: NotificationEvent.REMINDER_2HR },
      ),
      this.inboxService.save(
        booking.clientId,
        'Appointment Reminder (2 Hours)',
        `Your appointment at ${salonName} is coming up at ${vars.time}.`,
        NotificationType.BOOKING_REMINDER,
        { bookingId: booking.id },
      ),
    ]);
  }

  // ── booking.reminder.15min (SSE in-app) ───────────────────────────────────

  @Process(NotificationEvent.REMINDER_15MIN)
  async handleReminder15Min(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, salonName } = job.data;
    await Promise.allSettled([
      this.ssePush.push(booking.clientId, NotificationEvent.REMINDER_15MIN, {
        bookingId:   booking.id,
        salonName,
        serviceName: booking.services.map((s) => s.name).join(', '),
        startTime:   booking.startTime,
      }),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Appointment Starting Soon',
        `Your appointment at ${salonName} is in 15 minutes!`,
        { bookingId: booking.id, event: NotificationEvent.REMINDER_15MIN },
      ),
      this.inboxService.save(
        booking.clientId,
        'Appointment Starting Soon',
        `Your appointment at ${salonName} for ${booking.services.map((s) => s.name).join(', ')} is in 15 minutes.`,
        NotificationType.BOOKING_REMINDER,
        { bookingId: booking.id },
      ),
    ]);
    this.logger.log(
      `Sent 15-min reminder to client ${booking.clientId} for booking ${booking.id}`,
    );
  }

  // ── booking.reminder.now (SSE in-app) ─────────────────────────────────────

  @Process(NotificationEvent.REMINDER_NOW)
  async handleReminderNow(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, salonName } = job.data;
    await Promise.allSettled([
      this.ssePush.push(booking.clientId, NotificationEvent.REMINDER_NOW, {
        bookingId:   booking.id,
        salonName,
        serviceName: booking.services.map((s) => s.name).join(', '),
        startTime:   booking.startTime,
      }),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Appointment Starting Now',
        `Your appointment at ${salonName} is starting now!`,
        { bookingId: booking.id, event: NotificationEvent.REMINDER_NOW },
      ),
      this.inboxService.save(
        booking.clientId,
        'Appointment Starting Now',
        `Your appointment at ${salonName} for ${booking.services.map((s) => s.name).join(', ')} is starting now.`,
        NotificationType.BOOKING_REMINDER,
        { bookingId: booking.id },
      ),
    ]);
    this.logger.log(
      `Sent now-reminder to client ${booking.clientId} for booking ${booking.id}`,
    );
  }

  // ── Queue error handler ────────────────────────────────────────────────────

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Reminder job failed | queue=${NOTIFICATION_QUEUE} event=${job.name} id=${job.id}: ${error.message}`,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async sendEmail(
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
      this.logger.error(`Reminder email failed [${type}] → ${recipient}: ${message}`);
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
      this.logger.error(`Reminder SMS failed [${type}] → ${recipient}: ${message}`);
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
      this.logger.error(`Reminder WhatsApp failed [${type}] → ${recipient}: ${message}`);
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

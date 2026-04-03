import { Inject, Injectable, Logger } from '@nestjs/common';
import { SubscriptionCheckService } from '@org/subscription-check';

import {
  NotificationChannel,
  TemplateType,
} from './constants/notification-events.constants';
import { TemplateService, TemplateVariables } from './template.service';
import { NotificationStatus } from './schemas/notification-log.schema';
import { InboxNotificationService } from './inbox-notification.service';
import { NotificationType } from './schemas/inbox-notification.schema';
import {
  EMAIL_SERVICE,
  IEmailService,
  ISmsService,
  IWhatsAppService,
  SMS_SERVICE,
  WHATSAPP_SERVICE,
} from './interfaces/notification-channel.interface';

/**
 * Centralised dispatch logic for sending notifications via email, SMS, and WhatsApp.
 *
 * Extracts the repeated send-render-log-inbox pattern that was previously
 * duplicated across BookingNotificationProcessor and ReminderNotificationProcessor,
 * adhering to DRY and SRP.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    @Inject(EMAIL_SERVICE)
    private readonly email: IEmailService,
    @Inject(SMS_SERVICE)
    private readonly sms: ISmsService,
    @Inject(WHATSAPP_SERVICE)
    private readonly whatsApp: IWhatsAppService,
    private readonly templates: TemplateService,
    private readonly inboxService: InboxNotificationService,
    private readonly subscriptionCheck: SubscriptionCheckService,
  ) {}

  // ── Email ────────────────────────────────────────────────────────────────

  async sendEmail(
    event: string,
    type: TemplateType,
    recipient: string,
    vars: TemplateVariables,
    bookingId: string,
    userId?: string,
    calendarInvite?: { icsContent: string; googleCalendarUrl: string },
  ): Promise<void> {
    try {
      const { subject, body } = await this.templates.render(
        type,
        NotificationChannel.EMAIL,
        vars,
      );
      const msgId = await this.email.sendEmail({
        to: recipient,
        toName: vars.ownerName ?? vars.stylistName ?? vars.clientName ?? '',
        subject,
        html: body,
        calendarInvite,
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

  // ── SMS ──────────────────────────────────────────────────────────────────

  async sendSms(
    event: string,
    type: TemplateType,
    recipient: string,
    vars: TemplateVariables,
    bookingId: string,
    userId?: string,
    salonId?: string,
  ): Promise<void> {
    try {
      if (salonId) {
        const allowed = await this.subscriptionCheck.checkFeature(salonId, 'sms_notifications');
        if (!allowed) {
          this.logger.warn(
            `SMS skipped for salon ${salonId} — feature 'sms_notifications' not available in plan`,
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

  // ── WhatsApp ─────────────────────────────────────────────────────────────

  async sendWhatsApp(
    event: string,
    type: TemplateType,
    recipient: string,
    vars: TemplateVariables,
    bookingId: string,
    userId?: string,
    salonId?: string,
  ): Promise<void> {
    try {
      if (salonId) {
        const allowed = await this.subscriptionCheck.checkFeature(salonId, 'whatsapp');
        if (!allowed) {
          this.logger.warn(
            `WhatsApp skipped for salon ${salonId} — feature 'whatsapp' not available in plan`,
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

  // ── Inbox ────────────────────────────────────────────────────────────────

  async saveToInbox(
    userId: string,
    title: string,
    body: string,
    event: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const type = this.mapToNotificationType(event);
      await this.inboxService.save(userId, title, body, type, data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to save inbox notification for userId=${userId}: ${message}`);
    }
  }

  // ── Shared mapping helpers ───────────────────────────────────────────────

  mapToNotificationType(event: string): NotificationType {
    const map: Record<string, NotificationType> = {
      'booking.created': NotificationType.BOOKING_CREATED,
      'booking.confirmed': NotificationType.BOOKING_CONFIRMED,
      'booking.cancelled': NotificationType.BOOKING_CANCELLED,
      'booking.completed': NotificationType.BOOKING_COMPLETED,
      'booking.reminder.15min': NotificationType.BOOKING_REMINDER,
      'booking.reminder.now': NotificationType.BOOKING_REMINDER,
      'booking.reminder.24hr': NotificationType.BOOKING_REMINDER,
      'booking.reminder.2hr': NotificationType.BOOKING_REMINDER,
      'booking.review.request': NotificationType.REVIEW_REQUEST,
      'review.nudge': NotificationType.REVIEW_REQUEST,
      'staff.joined': NotificationType.STAFF_JOINED,
      'salon.invitation': NotificationType.SYSTEM,
      'message.new': NotificationType.NEW_MESSAGE,
    };
    return map[event] ?? NotificationType.SYSTEM;
  }

  getNotificationTitle(event: string): string {
    const map: Record<string, string> = {
      'booking.created': 'Booking Created',
      'booking.confirmed': 'Booking Confirmed',
      'booking.cancelled': 'Booking Cancelled',
      'booking.completed': 'Booking Completed',
      'booking.reminder.15min': 'Appointment Reminder (15 min)',
      'booking.reminder.now': 'Appointment Starting Now',
      'booking.reminder.24hr': 'Appointment Reminder (24 Hours)',
      'booking.reminder.2hr': 'Appointment Reminder (2 Hours)',
      'booking.review.request': 'Review Request',
      'review.nudge': 'Review Request',
    };
    return map[event] ?? 'Notification';
  }
}

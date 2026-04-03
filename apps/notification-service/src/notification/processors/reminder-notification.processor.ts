import { Inject, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

import {
  NOTIFICATION_QUEUE,
  NotificationEvent,
  TemplateType,
} from '../constants/notification-events.constants';
import { BookingNotificationPayload } from '../interfaces/notification-payload.interface';
import {
  IPushNotificationService,
  PUSH_NOTIFICATION_SERVICE,
} from '../interfaces/notification-channel.interface';
import { SsePushService } from '../providers/sse-push.service';
import { NotificationDispatchService } from '../notification-dispatch.service';
import { InboxNotificationService } from '../inbox-notification.service';
import { NotificationType } from '../schemas/inbox-notification.schema';
import { TemplateVariables } from '../template.service';

@Processor(NOTIFICATION_QUEUE)
export class ReminderNotificationProcessor {
  private readonly logger = new Logger(ReminderNotificationProcessor.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    @Inject(PUSH_NOTIFICATION_SERVICE)
    private readonly pushNotification: IPushNotificationService,
    private readonly ssePush: SsePushService,
    private readonly inboxService: InboxNotificationService,
  ) {}

  // ── booking.reminder.24hr ──────────────────────────────────────────────────

  @Process(NotificationEvent.REMINDER_24HR)
  async handleReminder24Hr(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonName, salonAddress, stylist, stylistId, stylistName } = job.data;

    const baseVars: TemplateVariables = {
      salonName,
      address: salonAddress,
      serviceName: booking.services.map((s) => s.name).join(', '),
      date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
      time: booking.startTime,
      totalPrice: booking.totalPrice.toFixed(2),
    };

    // Client reminder
    await Promise.allSettled([
      this.dispatch.sendEmail(
        NotificationEvent.REMINDER_24HR,
        TemplateType.BOOKING_REMINDER_24HR,
        client.email,
        { ...baseVars, clientName: client.name },
        booking.id,
      ),
      this.dispatch.sendWhatsApp(
        NotificationEvent.REMINDER_24HR,
        TemplateType.BOOKING_REMINDER_24HR,
        client.phone,
        { ...baseVars, clientName: client.name },
        booking.id,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Appointment Reminder (24 Hours)',
        `Reminder: Your appointment at ${salonName} is tomorrow at ${baseVars.time}.`,
        { bookingId: booking.id, event: NotificationEvent.REMINDER_24HR },
      ),
      this.inboxService.save(
        booking.clientId,
        'Appointment Reminder (24 Hours)',
        `Your appointment at ${salonName} is scheduled for ${baseVars.date} at ${baseVars.time}.`,
        NotificationType.BOOKING_REMINDER,
        { bookingId: booking.id },
      ),
    ]);

    // Stylist 24-hour reminder
    if (stylist?.email && stylistId) {
      const stylistDisplayName = stylistName ?? stylist.name;
      await Promise.allSettled([
        this.dispatch.sendEmail(
          NotificationEvent.REMINDER_24HR,
          TemplateType.BOOKING_REMINDER_24HR_STYLIST,
          stylist.email,
          { ...baseVars, stylistName: stylistDisplayName, clientName: client.name },
          booking.id,
        ),
        this.pushNotification.sendToUser(
          stylistId,
          'Appointment Tomorrow',
          `Reminder: You have an appointment with ${client.name} tomorrow at ${baseVars.time} at ${salonName}.`,
          { bookingId: booking.id, event: NotificationEvent.REMINDER_24HR },
        ),
      ]);
    }
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
      this.dispatch.sendSms(
        NotificationEvent.REMINDER_2HR,
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
}

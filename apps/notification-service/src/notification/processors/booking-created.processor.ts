import { Inject, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';

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
import { TemplateVariables } from '../template.service';

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/** Parse "YYYY-MM-DD" + "HH:mm" as a local-time millisecond timestamp. */
function parseAppointmentMs(appointmentDate: string, startTime: string): number {
  const datePart = (appointmentDate ?? '').slice(0, 10);
  return new Date(`${datePart}T${startTime}:00`).getTime();
}

/**
 * Handles the `booking.created` event — the most complex notification flow,
 * sending to client, salon owner, and optionally an assigned stylist.
 *
 * Separated from lifecycle events (confirmed/cancelled/completed/review)
 * to honour the Single Responsibility Principle.
 */
@Processor(NOTIFICATION_QUEUE)
export class BookingCreatedProcessor {
  private readonly logger = new Logger(BookingCreatedProcessor.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    @Inject(PUSH_NOTIFICATION_SERVICE)
    private readonly pushNotification: IPushNotificationService,
    private readonly ssePush: SsePushService,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notifQueue: Queue,
  ) {}

  @Process(NotificationEvent.BOOKING_CREATED)
  async handle(job: Job<BookingNotificationPayload>): Promise<void> {
    const {
      booking, client, salonOwner, salonName, salonAddress,
      salonOwnerId, stylist, stylistId, stylistName,
    } = job.data;

    const vars: TemplateVariables = {
      salonName,
      address: salonAddress,
      serviceName: booking.services.map((s) => s.name).join(', '),
      date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
      time: booking.startTime,
      totalPrice: booking.totalPrice.toFixed(2),
    };

    // ── Client notifications (email + WhatsApp + push) ───────────────────
    await Promise.allSettled([
      this.dispatch.sendEmail(
        NotificationEvent.BOOKING_CREATED,
        TemplateType.BOOKING_CREATED,
        client.email,
        { ...vars, clientName: client.name },
        booking.id,
        booking.clientId,
      ),
      this.dispatch.sendWhatsApp(
        NotificationEvent.BOOKING_CREATED,
        TemplateType.BOOKING_CREATED,
        client.phone,
        { ...vars, clientName: client.name },
        booking.id,
        booking.clientId,
        booking.salonId,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        '📅 Booking Created',
        `Your ${vars.serviceName} appointment at ${salonName} is booked for ${vars.date} at ${booking.startTime}.`,
        { bookingId: booking.id, event: NotificationEvent.BOOKING_CREATED },
      ),
    ]);

    // ── Salon-owner notifications ────────────────────────────────────────
    if (salonOwner.email) {
      await Promise.allSettled([
        this.dispatch.sendEmail(
          NotificationEvent.BOOKING_CREATED,
          TemplateType.BOOKING_CREATED_OWNER,
          salonOwner.email,
          { ...vars, ownerName: salonOwner.name, clientName: client.name },
          booking.id,
          salonOwnerId,
        ),
        this.dispatch.sendWhatsApp(
          NotificationEvent.BOOKING_CREATED,
          TemplateType.BOOKING_CREATED,
          salonOwner.phone,
          { ...vars, clientName: client.name },
          booking.id,
          salonOwnerId,
          booking.salonId,
        ),
      ]);
    }

    // ── Stylist notifications (email + push) — only when assigned ────────
    if (stylist && stylistId) {
      const stylistDisplayName = stylistName ?? stylist.name;
      await Promise.allSettled([
        ...(stylist.email
          ? [
              this.dispatch.sendEmail(
                NotificationEvent.BOOKING_CREATED,
                TemplateType.BOOKING_CREATED_STYLIST,
                stylist.email,
                { ...vars, stylistName: stylistDisplayName, clientName: client.name },
                booking.id,
              ),
            ]
          : []),
        this.pushNotification.sendToUser(
          stylistId,
          '💇 New Appointment',
          `${client.name} booked ${vars.serviceName} with you at ${salonName} on ${vars.date} at ${booking.startTime}.`,
          { bookingId: booking.id, event: NotificationEvent.BOOKING_CREATED },
        ),
      ]);
    }

    // ── Dedicated inbox saves ────────────────────────────────────────────
    const inboxData = {
      bookingId: booking.id,
      clientName: client.name,
      serviceName: vars['serviceName'],
      appointmentDate: vars['date'],
      startTime: booking.startTime,
    };

    await Promise.allSettled([
      this.dispatch.saveToInbox(
        booking.clientId,
        '📅 Booking Created',
        `Your ${vars['serviceName']} appointment at ${salonName} is booked for ${vars['date']} at ${booking.startTime}.`,
        NotificationEvent.BOOKING_CREATED,
        inboxData,
      ),
      salonOwnerId
        ? this.dispatch.saveToInbox(
            salonOwnerId,
            '📅 New Booking',
            `${client.name} booked ${vars['serviceName']} on ${vars['date']} at ${booking.startTime}.`,
            NotificationEvent.BOOKING_CREATED,
            inboxData,
          )
        : Promise.resolve(),
    ]);

    // ── SSE real-time push ───────────────────────────────────────────────
    if (salonOwnerId) {
      await this.ssePush.push(salonOwnerId, 'booking.new', inboxData);
    }
    if (stylistId) {
      await this.ssePush.push(stylistId, 'booking.new.stylist', {
        ...inboxData,
        salonName,
      });
    }

    // ── Schedule 15-min and now SSE reminders ────────────────────────────
    const appointmentMs = parseAppointmentMs(booking.appointmentDate, booking.startTime);
    const now = Date.now();
    const delay15Min = appointmentMs - now - FIFTEEN_MIN_MS;
    const delayNow = appointmentMs - now;
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
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Job failed | queue=${NOTIFICATION_QUEUE} event=${job.name} id=${job.id}: ${error.message}`,
    );
  }
}

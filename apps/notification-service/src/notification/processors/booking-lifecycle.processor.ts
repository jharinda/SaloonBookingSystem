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
import { NotificationDispatchService } from '../notification-dispatch.service';
import { TemplateVariables } from '../template.service';
import { buildCalendarInvite, CalendarInvite } from '../utils/calendar.utils';
import { REVIEW_NUDGE_JOB } from './review-nudge.processor';

const ORGANIZER_EMAIL = 'noreply@snapsalon.lk';

/**
 * Handles booking lifecycle events: confirmed, cancelled, completed.
 * On completed, schedules a delayed `review-nudge` job onto NOTIFICATION_QUEUE.
 *
 * Separated from the booking-created flow (which is the most complex handler)
 * to honour the Single Responsibility Principle.
 */
@Processor(NOTIFICATION_QUEUE)
export class BookingLifecycleProcessor {
  private readonly logger = new Logger(BookingLifecycleProcessor.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    @Inject(PUSH_NOTIFICATION_SERVICE)
    private readonly pushNotification: IPushNotificationService,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notifQueue: Queue,
  ) {}

  // ── booking.confirmed ──────────────────────────────────────────────────

  @Process(NotificationEvent.BOOKING_CONFIRMED)
  async handleBookingConfirmed(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonOwner, salonOwnerId, salonName, salonAddress, stylist, stylistId, stylistName } = job.data;

    const serviceName = booking.services.map((s) => s.name).join(', ');

    const baseVars: TemplateVariables = {
      salonName,
      address: salonAddress,
      serviceName,
      date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
      time: booking.startTime,
      totalPrice: booking.totalPrice.toFixed(2),
    };

    // Build a calendar invite for each recipient
    const calendarBase = {
      bookingId:       booking.id,
      appointmentDate: booking.appointmentDate,
      startTime:       booking.startTime,
      endTime:         booking.endTime,
      serviceName,
      salonName,
      salonAddress,
      organizerEmail:  ORGANIZER_EMAIL,
      totalPrice:      booking.totalPrice.toFixed(2),
    };

    const clientCalendar: CalendarInvite = buildCalendarInvite({
      ...calendarBase,
      attendeeEmail: client.email,
      attendeeName:  client.name,
    });

    // Client
    await Promise.allSettled([
      this.dispatch.sendEmail(
        NotificationEvent.BOOKING_CONFIRMED,
        TemplateType.BOOKING_CONFIRMED,
        client.email,
        { ...baseVars, clientName: client.name },
        booking.id,
        booking.clientId,
        clientCalendar,
      ),
      this.dispatch.sendSms(
        NotificationEvent.BOOKING_CONFIRMED,
        TemplateType.BOOKING_CONFIRMED,
        client.phone,
        { ...baseVars, clientName: client.name },
        booking.id,
        booking.clientId,
        booking.salonId,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Booking Confirmed',
        `Your booking at ${salonName} has been confirmed for ${baseVars.date} at ${baseVars.time}.`,
        { bookingId: booking.id, event: NotificationEvent.BOOKING_CONFIRMED },
      ),
    ]);

    // Salon owner
    if (salonOwner?.email) {
      const ownerCalendar: CalendarInvite = buildCalendarInvite({
        ...calendarBase,
        attendeeEmail: salonOwner.email,
        attendeeName:  salonOwner.name,
      });
      await Promise.allSettled([
        this.dispatch.sendEmail(
          NotificationEvent.BOOKING_CONFIRMED,
          TemplateType.BOOKING_CONFIRMED_OWNER,
          salonOwner.email,
          { ...baseVars, ownerName: salonOwner.name, clientName: client.name },
          booking.id,
          salonOwnerId,
          ownerCalendar,
        ),
        salonOwnerId
          ? this.pushNotification.sendToUser(
              salonOwnerId,
              '✅ Booking Confirmed',
              `Booking for ${client.name} on ${baseVars.date} at ${baseVars.time} has been confirmed.`,
              { bookingId: booking.id, event: NotificationEvent.BOOKING_CONFIRMED },
            )
          : Promise.resolve(),
      ]);
    }

    // Stylist
    if (stylist?.email && stylistId) {
      const stylistDisplayName = stylistName ?? stylist.name;
      const stylistCalendar: CalendarInvite = buildCalendarInvite({
        ...calendarBase,
        attendeeEmail: stylist.email,
        attendeeName:  stylistDisplayName,
      });
      await Promise.allSettled([
        this.dispatch.sendEmail(
          NotificationEvent.BOOKING_CONFIRMED,
          TemplateType.BOOKING_CONFIRMED_STYLIST,
          stylist.email,
          { ...baseVars, stylistName: stylistDisplayName, clientName: client.name },
          booking.id,
          stylistId,
          stylistCalendar,
        ),
        this.pushNotification.sendToUser(
          stylistId,
          '✅ Appointment Confirmed',
          `Your appointment with ${client.name} on ${baseVars.date} at ${baseVars.time} is confirmed.`,
          { bookingId: booking.id, event: NotificationEvent.BOOKING_CONFIRMED },
        ),
      ]);
    }

    await this.dispatch.saveToInbox(
      booking.clientId,
      '✅ Booking Confirmed',
      `Your ${baseVars.serviceName} appointment at ${salonName} on ${baseVars.date} at ${baseVars.time} has been confirmed.`,
      NotificationEvent.BOOKING_CONFIRMED,
      { bookingId: booking.id },
    );
  }

  // ── booking.cancelled ──────────────────────────────────────────────────

  @Process(NotificationEvent.BOOKING_CANCELLED)
  async handleBookingCancelled(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonOwner, salonName, salonAddress, salonOwnerId, stylist, stylistId, stylistName } = job.data;

    const baseVars: TemplateVariables = {
      salonName,
      address: salonAddress,
      serviceName: booking.services.map((s) => s.name).join(', '),
      date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
      time: booking.startTime,
      reason: booking.cancellationReason ?? 'No reason provided',
    };

    // Client
    await Promise.allSettled([
      this.dispatch.sendEmail(
        NotificationEvent.BOOKING_CANCELLED,
        TemplateType.BOOKING_CANCELLED,
        client.email,
        { ...baseVars, clientName: client.name },
        booking.id,
        booking.clientId,
      ),
      this.pushNotification.sendToUser(
        booking.clientId,
        'Booking Cancelled',
        `Your booking at ${salonName} for ${baseVars.date} at ${baseVars.time} has been cancelled. Reason: ${baseVars.reason}`,
        { bookingId: booking.id, event: NotificationEvent.BOOKING_CANCELLED },
      ),
    ]);

    // Salon owner
    if (salonOwner?.email) {
      await Promise.allSettled([
        this.dispatch.sendEmail(
          NotificationEvent.BOOKING_CANCELLED,
          TemplateType.BOOKING_CANCELLED_OWNER,
          salonOwner.email,
          { ...baseVars, ownerName: salonOwner.name, clientName: client.name },
          booking.id,
          salonOwnerId,
        ),
        salonOwnerId
          ? this.pushNotification.sendToUser(
              salonOwnerId,
              'Booking Cancelled',
              `Booking by ${client.name} for ${baseVars.date} at ${baseVars.time} has been cancelled.`,
              { bookingId: booking.id, event: NotificationEvent.BOOKING_CANCELLED },
            )
          : Promise.resolve(),
      ]);
    }

    // Stylist — only when the cancelled booking had an assigned stylist
    if (stylist?.email && stylistId) {
      const stylistDisplayName = stylistName ?? stylist.name;
      await Promise.allSettled([
        this.dispatch.sendEmail(
          NotificationEvent.BOOKING_CANCELLED,
          TemplateType.BOOKING_CANCELLED_STYLIST,
          stylist.email,
          { ...baseVars, stylistName: stylistDisplayName, clientName: client.name },
          booking.id,
          stylistId,
        ),
        this.pushNotification.sendToUser(
          stylistId,
          'Appointment Cancelled',
          `Appointment with ${client.name} on ${baseVars.date} at ${baseVars.time} was cancelled.`,
          { bookingId: booking.id, event: NotificationEvent.BOOKING_CANCELLED },
        ),
      ]);
    }

    await Promise.allSettled([
      this.dispatch.saveToInbox(
        booking.clientId,
        '❌ Booking Cancelled',
        `Your ${baseVars.serviceName} appointment at ${salonName} on ${baseVars.date} at ${baseVars.time} has been cancelled. Reason: ${baseVars.reason}`,
        NotificationEvent.BOOKING_CANCELLED,
        { bookingId: booking.id },
      ),
      salonOwnerId
        ? this.dispatch.saveToInbox(
            salonOwnerId,
            '❌ Booking Cancelled',
            `Booking by ${client.name} for ${baseVars.serviceName} on ${baseVars.date} at ${baseVars.time} was cancelled.`,
            NotificationEvent.BOOKING_CANCELLED,
            { bookingId: booking.id },
          )
        : Promise.resolve(),
    ]);
  }

  // ── booking.completed ──────────────────────────────────────────────────

  @Process(NotificationEvent.BOOKING_COMPLETED)
  async handleBookingCompleted(
    job: Job<BookingNotificationPayload>,
  ): Promise<void> {
    const { booking, client, salonOwner, salonOwnerId, salonName, salonAddress } = job.data;

    // Salon owner — send a completion summary immediately
    if (salonOwner?.email) {
      const vars: TemplateVariables = {
        ownerName: salonOwner.name,
        clientName: client.name,
        salonName,
        address: salonAddress,
        serviceName: booking.services.map((s) => s.name).join(', '),
        date: new Date(booking.appointmentDate).toLocaleDateString('en-LK'),
        time: booking.startTime,
        totalPrice: booking.totalPrice.toFixed(2),
      };
      await Promise.allSettled([
        this.dispatch.sendEmail(
          NotificationEvent.BOOKING_COMPLETED,
          TemplateType.BOOKING_COMPLETED_OWNER,
          salonOwner.email,
          vars,
          booking.id,
          salonOwnerId,
        ),
        salonOwnerId
          ? this.dispatch.saveToInbox(
              salonOwnerId,
              '✔️ Appointment Completed',
              `${client.name}'s ${vars.serviceName} appointment on ${vars.date} at ${vars.time} has been completed.`,
              NotificationEvent.BOOKING_COMPLETED,
              { bookingId: booking.id },
            )
          : Promise.resolve(),
      ]);
    }

    this.logger.log(
      `Scheduling review nudge for booking ${booking.id} in 2 hours`,
    );

    await this.notifQueue.add(
      REVIEW_NUDGE_JOB,
      {
        bookingId: booking.id,
        clientId: booking.clientId,
        clientEmail: client.email,
        clientName: client.name,
        salonName,
        salonId: booking.salonId,
      },
      {
        delay: 2 * 60 * 60 * 1000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    );
  }

  // ── Queue error handler ────────────────────────────────────────────────

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Job failed | queue=${NOTIFICATION_QUEUE} event=${job.name} id=${job.id}: ${error.message}`,
    );
  }
}

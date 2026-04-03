import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { InboxNotificationService } from '../inbox-notification.service';
import { NotificationType } from '../schemas/inbox-notification.schema';

/**
 * Thin wrapper around the API gateway's internal SSE push endpoint.
 * Allows notification processors to send real-time in-app notifications
 * to any connected user without caring about the underlying SSE transport.
 *
 * The gateway endpoint is: POST /api/notifications/push
 * It expects { userId, event, data } + an X-Internal-Token header.
 *
 * Failures are logged and swallowed — SSE is best-effort; email/SMS remain
 * the authoritative delivery channel.
 */
@Injectable()
export class SsePushService {
  private readonly logger = new Logger(SsePushService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly inboxService: InboxNotificationService,
  ) {}

  async push(userId: string, event: string, data: unknown): Promise<void> {
    if (!userId) {
      this.logger.warn(`SSE push skipped — no userId provided for event "${event}"`);
      return;
    }

    // 1. Always persist — this is the inbox queue for offline users.
    const title = this.getEventTitle(event);
    const body = this.getEventBody(event, data);
    const type = this.mapEventToNotificationType(event);
    await this.inboxService.save(userId, title, body, type, data as Record<string, unknown>);

    // 2. Best-effort live delivery via SSE.
    const gatewayUrl    = this.config.get<string>('gatewayUrl') ?? 'http://localhost:3000';
    const internalToken = this.config.get<string>('internalToken') ?? '';

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    // Only send the token header if one is configured
    if (internalToken) {
      headers['x-internal-token'] = internalToken;
    }

    try {
      await firstValueFrom(
        this.http.post(
          `${gatewayUrl}/api/notifications/push`,
          { userId, event, data },
          { headers },
        ),
      );
      this.logger.debug(`SSE event "${event}" pushed to user ${userId}`);
    } catch (err: unknown) {
      this.logger.warn(
        `SSE push failed (event="${event}", userId=${userId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Map SSE event name to NotificationType
   */
  private mapEventToNotificationType(event: string): NotificationType {
    // SSE events use dot notation like "booking.new", "booking.confirmed"
    switch (event) {
      case 'booking.new':
        return NotificationType.BOOKING_CREATED;
      case 'booking.new.stylist':
        return NotificationType.BOOKING_CREATED;
      case 'booking.confirmed':
        return NotificationType.BOOKING_CONFIRMED;
      case 'booking.cancelled':
        return NotificationType.BOOKING_CANCELLED;
      case 'booking.completed':
        return NotificationType.BOOKING_COMPLETED;
      case 'staff.joined':
        return NotificationType.STAFF_JOINED;
      case 'salon.invitation':
        return NotificationType.SYSTEM;
      case 'booking.reminder.15min':
      case 'booking.reminder.now':
      case 'booking.reminder.24hr':
      case 'booking.reminder.2hr':
        return NotificationType.BOOKING_REMINDER;
      case 'review.posted':
      case 'booking.review.request':
      case 'review.nudge':
        return NotificationType.REVIEW_REQUEST;
      case 'message.new':
        return NotificationType.NEW_MESSAGE;
      default:
        return NotificationType.SYSTEM;
    }
  }

  /**
   * Generate user-friendly title from SSE event
   */
  private getEventTitle(event: string): string {
    switch (event) {
      case 'booking.new':
        return 'New Booking';
      case 'booking.new.stylist':
        return 'New Appointment';
      case 'booking.confirmed':
        return 'Booking Confirmed';
      case 'booking.cancelled':
        return 'Booking Cancelled';
      case 'booking.completed':
        return 'Booking Completed';
      case 'staff.joined':
        return 'New Staff Member';
      case 'salon.invitation':
        return 'Salon Invitation';
      case 'booking.reminder.15min':
        return 'Appointment in 15 Minutes';
      case 'booking.reminder.now':
        return 'Appointment Starting Now';
      case 'booking.reminder.24hr':
        return 'Appointment Reminder (24 Hours)';
      case 'booking.reminder.2hr':
        return 'Appointment Reminder (2 Hours)';
      case 'review.posted':
        return 'New Review Received';
      case 'booking.review.request':
      case 'review.nudge':
        return 'Review Request';
      case 'message.new':
        return 'New Message';
      default:
        return 'Notification';
    }
  }

  /**
   * Generate user-friendly body from SSE event and data
   */
  private getEventBody(event: string, data: unknown): string {
    const d = (data ?? {}) as Record<string, unknown>;

    switch (event) {
      case 'booking.new':
        return `You have a new booking from ${d['clientName'] ?? 'a client'} for ${d['serviceName'] ?? 'services'} on ${d['appointmentDate'] ?? 'today'} at ${d['startTime'] ?? 'scheduled time'}.`;
      case 'booking.new.stylist':
        return `${d['clientName'] ?? 'A client'} has booked ${d['serviceName'] ?? 'an appointment'} with you on ${d['appointmentDate'] ?? 'today'} at ${d['startTime'] ?? 'scheduled time'}.`;
      case 'booking.confirmed':
        return `Your booking at ${d['salonName'] ?? 'the salon'} has been confirmed for ${d['appointmentDate'] ?? 'your appointment'}.`;
      case 'booking.cancelled':
        return `Your booking at ${d['salonName'] ?? 'the salon'} has been cancelled.`;
      case 'booking.completed':
        return `Your booking at ${d['salonName'] ?? 'the salon'} has been completed. We hope you enjoyed your experience!`;
      case 'staff.joined':
        return `${d['staffName'] ?? 'A new staff member'} has joined your salon.`;
      case 'salon.invitation':
        return `You have been invited to join ${d['salonName'] ?? 'a salon'}.`;
      case 'booking.reminder.15min':
        return `Your ${d['serviceName'] ?? 'appointment'} at ${d['salonName'] ?? 'the salon'} starts in 15 minutes at ${d['startTime'] ?? 'scheduled time'}.`;
      case 'booking.reminder.now':
        return `Your ${d['serviceName'] ?? 'appointment'} at ${d['salonName'] ?? 'the salon'} is starting now!`;
      case 'booking.reminder.24hr':
        return `Reminder: Your appointment at ${d['salonName'] ?? 'the salon'} is tomorrow at ${d['startTime'] ?? 'scheduled time'}.`;
      case 'booking.reminder.2hr':
        return `Reminder: Your appointment at ${d['salonName'] ?? 'the salon'} is in 2 hours at ${d['startTime'] ?? 'scheduled time'}.`;
      case 'review.posted':
        return `${d['clientName'] ?? 'A client'} gave you ${d['rating'] ?? ''} stars${d['serviceName'] ? ' for ' + d['serviceName'] : ''}.`;
      case 'booking.review.request':
      case 'review.nudge':
        return `How was your experience? Please leave a review for your recent appointment.`;
      case 'message.new':
        return `You have a new message from ${d['senderName'] ?? 'someone'}.`;
      default:
        return 'You have a new notification.';
    }
  }
}

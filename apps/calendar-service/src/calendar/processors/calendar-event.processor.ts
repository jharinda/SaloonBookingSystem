import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { BOOKING_QUEUE, CalendarEvent } from '../constants/calendar-events.constants';
import { CalendarJobPayload } from '../interfaces/calendar-payload.interface';
import { GoogleCalendarService } from '../google-calendar.service';

@Processor(BOOKING_QUEUE)
export class CalendarEventProcessor {
  private readonly logger = new Logger(CalendarEventProcessor.name);

  constructor(private readonly googleCalendar: GoogleCalendarService) {}

  // ── booking.confirmed ──────────────────────────────────────────────────────

  @Process(CalendarEvent.BOOKING_CONFIRMED)
  async handleBookingConfirmed(job: Job<CalendarJobPayload>): Promise<void> {
    const { booking, client, salonName, salonAddress } = job.data;

    try {
      const result = await this.googleCalendar.createEvent(
        booking,
        client,
        salonName,
        salonAddress,
      );

      if (result) {
        this.logger.log(
          `Calendar event created: bookingId=${booking.id} googleEventId=${result.googleEventId}`,
        );
        // NOTE: The booking-service should be notified to store the googleEventId.
        // In a microservices architecture this would be done via a response queue or
        // a direct HTTP/gRPC call back to the booking-service. The ID is logged here
        // so it can be correlated and stored by a downstream handler.
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to create Google Calendar event for bookingId=${booking.id}: ${message}`,
      );
      throw err; // Re-throw so Bull marks the job as failed and retries
    }
  }

  // ── booking.cancelled ──────────────────────────────────────────────────────

  @Process(CalendarEvent.BOOKING_CANCELLED)
  async handleBookingCancelled(job: Job<CalendarJobPayload>): Promise<void> {
    const { booking } = job.data;

    if (!booking.googleEventId) {
      this.logger.debug(
        `No googleEventId for bookingId=${booking.id} — skipping calendar deletion`,
      );
      return;
    }

    try {
      await this.googleCalendar.deleteEvent(booking.clientId, booking.googleEventId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to delete Google Calendar event for bookingId=${booking.id}: ${message}`,
      );
      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Calendar job failed | event=${job.name} id=${job.id}: ${error.message}`,
    );
  }
}

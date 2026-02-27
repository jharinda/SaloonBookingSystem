import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Job } from 'bull';
import { firstValueFrom } from 'rxjs';

import { BOOKING_QUEUE, CalendarEvent } from '../constants/calendar-events.constants';
import { CalendarJobPayload } from '../interfaces/calendar-payload.interface';
import { GoogleCalendarService } from '../google-calendar.service';

@Processor(BOOKING_QUEUE)
export class CalendarEventProcessor {
  private readonly logger = new Logger(CalendarEventProcessor.name);

  constructor(
    private readonly googleCalendar: GoogleCalendarService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

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
        // Write the googleEventId back to booking-service so it can be
        // included in future notification payloads and used for deletion.
        await this.patchGoogleEventId(booking.id, result.googleEventId);
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

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Tell booking-service to persist the Google Calendar event ID on the booking
   * document. Failures are logged but not re-thrown because the calendar event
   * was created successfully — the write-back is best-effort.
   */
  private async patchGoogleEventId(
    bookingId: string,
    googleEventId: string,
  ): Promise<void> {
    const bookingServiceUrl = this.config.get<string>(
      'BOOKING_SERVICE_URL',
      'http://booking-service',
    );
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${bookingServiceUrl}/api/bookings/${bookingId}/google-event`,
          { googleEventId },
        ),
      );
      this.logger.log(
        `googleEventId persisted on bookingId=${bookingId}`,
      );
    } catch (err: unknown) {
      // Non-fatal: log and move on
      this.logger.warn(
        `Failed to persist googleEventId for bookingId=${bookingId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

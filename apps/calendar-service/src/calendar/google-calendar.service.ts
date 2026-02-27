import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';

import { GoogleOAuthService } from './google-oauth.service';
import { BookingPayload, RecipientInfo } from './interfaces/calendar-payload.interface';

export interface CreatedEventResult {
  googleEventId: string;
  htmlLink: string | null;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly oAuth: GoogleOAuthService) {}

  /**
   * Create a Google Calendar event on the client's primary calendar.
   * Returns null if the client has not connected Google Calendar.
   */
  async createEvent(
    booking: BookingPayload,
    client: RecipientInfo,
    salonName: string,
    salonAddress: string,
  ): Promise<CreatedEventResult | null> {
    const authClient = await this.oAuth.getAuthorizedClient(booking.clientId);
    if (!authClient) {
      this.logger.debug(
        `No Google token for clientId=${booking.clientId} — skipping calendar event`,
      );
      return null;
    }

    const calApi = google.calendar({ version: 'v3', auth: authClient });
    const { start, end } = this.buildDateTimes(
      booking.appointmentDate,
      booking.startTime,
      booking.endTime,
    );

    const serviceNames = booking.services.map((s) => s.name).join(', ');
    const event: calendar_v3.Schema$Event = {
      summary: `${salonName} — ${serviceNames}`,
      location: salonAddress,
      description: [
        `Services: ${serviceNames}`,
        `Total: LKR ${booking.totalPrice.toFixed(2)}`,
        booking.notes ? `Notes: ${booking.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      start: { dateTime: start, timeZone: 'Asia/Colombo' },
      end: { dateTime: end, timeZone: 'Asia/Colombo' },
      attendees: [{ email: client.email, displayName: client.name }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 120 },
        ],
      },
    };

    const response = await calApi.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all',
    });

    const googleEventId = response.data.id ?? '';
    const htmlLink = response.data.htmlLink ?? null;
    this.logger.log(
      `Google Calendar event created: id=${googleEventId} clientId=${booking.clientId}`,
    );
    return { googleEventId, htmlLink };
  }

  /**
   * Delete a previously created Google Calendar event.
   * Gracefully handles 410 Gone (already deleted) responses.
   */
  async deleteEvent(
    clientId: string,
    googleEventId: string,
  ): Promise<void> {
    const authClient = await this.oAuth.getAuthorizedClient(clientId);
    if (!authClient) {
      this.logger.debug(
        `No Google token for clientId=${clientId} — cannot delete event ${googleEventId}`,
      );
      return;
    }

    const calApi = google.calendar({ version: 'v3', auth: authClient });

    try {
      await calApi.events.delete({
        calendarId: 'primary',
        eventId: googleEventId,
        sendUpdates: 'all',
      });
      this.logger.log(
        `Google Calendar event deleted: id=${googleEventId} clientId=${clientId}`,
      );
    } catch (err: unknown) {
      const status = (err as { code?: number })?.code;
      if (status === 410 || status === 404) {
        // Already deleted — not an error
        this.logger.warn(
          `Google Calendar event ${googleEventId} already gone (${status})`,
        );
        return;
      }
      throw err;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Build RFC 3339 dateTime strings from a date + HH:mm time pair.
   * Uses Asia/Colombo (UTC+5:30) as the local timezone.
   */
  private buildDateTimes(
    appointmentDate: string,
    startTime: string,
    endTime: string,
  ): { start: string; end: string } {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const datePart = appointmentDate.slice(0, 10); // 'YYYY-MM-DD'
    const start = `${datePart}T${pad(startH)}:${pad(startM)}:00+05:30`;
    const end = `${datePart}T${pad(endH)}:${pad(endM)}:00+05:30`;
    return { start, end };
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

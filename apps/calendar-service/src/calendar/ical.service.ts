import { Injectable } from '@nestjs/common';
import ical, { ICalCalendarMethod, ICalAlarmType } from 'ical-generator';

import { BookingPayload, RecipientInfo } from './interfaces/calendar-payload.interface';

export interface ICalResult {
  filename: string;
  content: string; // iCal text content
}

@Injectable()
export class ICalService {
  /**
   * Generate an RFC 5545 .ics file for a booking.
   * Works with Apple Calendar, Outlook, and any standards-compliant client.
   */
  generateBookingIcs(
    booking: BookingPayload,
    client: RecipientInfo,
    salonName: string,
    salonAddress: string,
    organizerEmail: string,
  ): ICalResult {
    const calendar = ical({
      name: 'SnapSalon Appointment',
      method: ICalCalendarMethod.REQUEST,
      prodId: '//SnapSalon//Booking//EN',
    });

    const { start, end } = this.buildDates(
      booking.appointmentDate,
      booking.startTime,
      booking.endTime,
    );

    const serviceNames = booking.services.map((s) => s.name).join(', ');
    const durationMin = booking.services.reduce((a, s) => a + s.durationMinutes, 0);
    const description = [
      `Services: ${serviceNames}`,
      `Duration: ${durationMin} min`,
      `Total: LKR ${booking.totalPrice.toFixed(2)}`,
      booking.notes ? `Notes: ${booking.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Use the chainable method API to avoid ICalEvent | ICalEventData union issues
    const event = calendar.createEvent({ start, end });
    event
      .uid(`booking-${booking.id}@snapsalon.lk`)
      .summary(`${salonName} \u2014 ${serviceNames}`)
      .description(description)
      .location(salonAddress)
      .timezone('Asia/Colombo')
      .organizer({ name: salonName, email: organizerEmail });

    event.createAttendee({ name: client.name, email: client.email, rsvp: true });

    // Positive trigger = fires N seconds BEFORE the event start
    event.createAlarm({ type: ICalAlarmType.display, trigger: 24 * 60 * 60 });
    event.createAlarm({ type: ICalAlarmType.display, trigger: 2 * 60 * 60 });

    return {
      filename: `snapsalon-booking-${booking.id}.ics`,
      content: calendar.toString(),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildDates(
    appointmentDate: string,
    startTime: string,
    endTime: string,
  ): { start: Date; end: Date } {
    const datePart = appointmentDate.slice(0, 10);
    const start = new Date(`${datePart}T${startTime}:00+05:30`);
    const end   = new Date(`${datePart}T${endTime}:00+05:30`);
    return { start, end };
  }
}

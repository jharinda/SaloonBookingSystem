/**
 * Utilities for generating iCalendar (.ics) invitations and Google Calendar URLs.
 *
 * The produced ICS uses METHOD:REQUEST so that:
 *   - Gmail automatically shows an "Add to Calendar" / "Yes / No / Maybe" prompt
 *     at the top of the email when the content is sent as a text/calendar MIME part.
 *   - Apple Calendar, Outlook, and other apps open the event directly when the .ics
 *     file is opened as an attachment.
 *
 * Times are stored internally in Sri Lanka Standard Time (SLST = UTC+5:30) and
 * converted to UTC for the ICS DTSTART / DTEND fields.
 */

export interface CalendarInviteOptions {
  /** Booking MongoDB ID — used to generate a globally unique UID */
  bookingId: string;
  /** ISO date string or YYYY-MM-DD */
  appointmentDate: string;
  /** HH:mm (SLST) */
  startTime: string;
  /** HH:mm (SLST) */
  endTime: string;
  serviceName: string;
  salonName: string;
  salonAddress: string;
  /** Recipient's email address (shown as attendee in the calendar event) */
  attendeeEmail: string;
  attendeeName: string;
  /**
   * Organizer address that appears as the sender of the invite.
   * Should match the verified SendGrid FROM address.
   */
  organizerEmail: string;
  /** Pre-formatted price string, e.g. "2500.00" */
  totalPrice?: string;
}

export interface CalendarInvite {
  /** Full iCalendar text — include as text/calendar MIME part or .ics attachment */
  icsContent: string;
  /** One-click "Add to Google Calendar" deep-link */
  googleCalendarUrl: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Sri Lanka Standard Time (SLST = UTC+5:30) date + time to a UTC Date.
 * Subtracts 5 hours 30 minutes from the local wall-clock time.
 */
function slstToUtc(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 5, m - 30));
}

/**
 * Format a UTC Date to the iCalendar date-time string format: 20260327T043000Z
 */
function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:.]/g, '').replace(/(\d{8}T\d{6})\d{3}Z/, '$1Z');
}

/**
 * Fold long ICS lines at 75 octets as required by RFC 5545.
 * Each continuation line starts with a single space character.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    chunks.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build an iCalendar invitation and a Google Calendar deep-link for a confirmed
 * SnapSalon appointment.
 *
 * @example
 * const { icsContent, googleCalendarUrl } = buildCalendarInvite({ ... });
 */
export function buildCalendarInvite(opts: CalendarInviteOptions): CalendarInvite {
  const dateStr = opts.appointmentDate.slice(0, 10);
  const startUtc = slstToUtc(dateStr, opts.startTime);
  const endUtc = slstToUtc(dateStr, opts.endTime);

  const summary = `${opts.serviceName} at ${opts.salonName}`;

  // ICS DESCRIPTION uses \n (escaped as \\n) for line breaks within the field
  const descriptionParts = [
    `Service: ${opts.serviceName}`,
    `Salon: ${opts.salonName}`,
    opts.salonAddress ? `Address: ${opts.salonAddress}` : null,
    opts.totalPrice ? `Total: LKR ${opts.totalPrice}` : null,
    '',
    'Powered by SnapSalon',
  ].filter((l) => l !== null);
  const icsDescription = descriptionParts.join('\\n');

  // ── ICS file content ──────────────────────────────────────────────────────
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SnapSalon//Appointments//EN',
    'CALSCALE:GREGORIAN',
    // METHOD:REQUEST makes Gmail show the "Add to Calendar" UI automatically
    'METHOD:REQUEST',
    'X-WR-CALNAME:SnapSalon Appointments',
    'BEGIN:VEVENT',
    `UID:booking-${opts.bookingId}@snapsalon.lk`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(startUtc)}`,
    `DTEND:${toIcsUtc(endUtc)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${icsDescription}`,
    `LOCATION:${opts.salonAddress ?? ''}`,
    `ORGANIZER;CN=SnapSalon:mailto:${opts.organizerEmail}`,
    `ATTENDEE;CN=${opts.attendeeName};RSVP=FALSE;PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT:mailto:${opts.attendeeEmail}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'PRIORITY:5',
    'CLASS:PUBLIC',
    // 1-hour reminder alarm
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Starting in 1 hour: ${summary}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const icsContent = lines.map(foldLine).join('\r\n');

  // ── Google Calendar deep-link ─────────────────────────────────────────────
  const gcDescription = descriptionParts
    .filter((l) => l !== null)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: `${toIcsUtc(startUtc)}/${toIcsUtc(endUtc)}`,
    details: gcDescription,
    location: opts.salonAddress ?? '',
    sf: 'true',
    output: 'xml',
  });
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;

  return { icsContent, googleCalendarUrl };
}

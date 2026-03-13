export const BOOKING_QUEUE = 'bookings';
export const CALENDAR_QUEUE = 'calendar';

export enum CalendarEvent {
  BOOKING_CONFIRMED = 'calendar.event.create',
  BOOKING_CANCELLED = 'calendar.event.delete',
}

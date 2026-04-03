export const BOOKING_QUEUE = 'bookings';

export enum BookingEvent {
  CREATED = 'booking.created',
  CONFIRMED = 'booking.confirmed',
  CANCELLED = 'booking.cancelled',
  COMPLETED = 'booking.completed',
  RESCHEDULED = 'booking.rescheduled',
  MODIFIED = 'booking.modified',
  NO_SHOW = 'booking.no_show',
  WAITLIST_SLOT_AVAILABLE = 'waitlist.slot-available',
}

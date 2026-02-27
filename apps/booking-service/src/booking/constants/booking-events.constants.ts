export const BOOKING_QUEUE = 'bookings';

export enum BookingEvent {
  CREATED = 'booking.created',
  CONFIRMED = 'booking.confirmed',
  CANCELLED = 'booking.cancelled',
  COMPLETED = 'booking.completed',
}

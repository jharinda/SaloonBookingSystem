export const NOTIFICATION_QUEUE = 'notifications';
export const BOOKING_QUEUE = 'bookings';

export enum NotificationEvent {
  // Consumed from the bookings queue
  BOOKING_CREATED = 'booking.created',
  BOOKING_CONFIRMED = 'booking.confirmed',
  BOOKING_CANCELLED = 'booking.cancelled',
  BOOKING_COMPLETED = 'booking.completed',

  // Produced by a scheduler (calendar-service / cron) and pushed to this queue
  REMINDER_24HR = 'booking.reminder.24hr',
  REMINDER_2HR = 'booking.reminder.2hr',
}

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

export enum TemplateType {
  BOOKING_CREATED = 'booking_created',
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_CANCELLED = 'booking_cancelled',
  BOOKING_REMINDER_24HR = 'booking_reminder_24hr',
  BOOKING_REMINDER_2HR = 'booking_reminder_2hr',
}

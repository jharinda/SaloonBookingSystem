export const NOTIFICATION_QUEUE = 'notifications';
export const BOOKING_QUEUE = 'bookings';

export enum NotificationEvent {
  // Consumed from the bookings queue
  BOOKING_CREATED = 'booking.created',
  BOOKING_CONFIRMED = 'booking.confirmed',
  BOOKING_CANCELLED = 'booking.cancelled',
  BOOKING_COMPLETED = 'booking.completed',

  // Delayed job queued by the completed handler — fires 2 hrs later
  REVIEW_REQUEST = 'booking.review.request',

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
  BOOKING_COMPLETED = 'booking_completed',
  BOOKING_REVIEW_REQUEST = 'booking_review_request',
  BOOKING_REMINDER_24HR = 'booking_reminder_24hr',
  BOOKING_REMINDER_2HR = 'booking_reminder_2hr',
}

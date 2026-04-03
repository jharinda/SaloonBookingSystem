export const NOTIFICATION_QUEUE = 'notifications';
export const BOOKING_QUEUE = 'bookings';

export enum NotificationEvent {
  // Consumed from the bookings queue
  BOOKING_CREATED = 'booking.created',
  BOOKING_CONFIRMED = 'booking.confirmed',
  BOOKING_CANCELLED = 'booking.cancelled',
  BOOKING_COMPLETED = 'booking.completed',

  REVIEW_REQUEST = 'booking.review.request',
  /** Event string for email/logs for the 2h delayed review nudge */
  REVIEW_NUDGE = 'review.nudge',

  // Produced by a scheduler (calendar-service / cron) and pushed to this queue
  REMINDER_24HR = 'booking.reminder.24hr',
  REMINDER_2HR  = 'booking.reminder.2hr',

  // In-app (SSE) reminders — scheduled by booking-notification processor
  REMINDER_15MIN = 'booking.reminder.15min',
  REMINDER_NOW   = 'booking.reminder.now',

  // Triggered by review-service when a client posts a review
  REVIEW_POSTED = 'review.posted',

  // Auth events — pushed to the notifications queue by auth-service
  AUTH_PASSWORD_RESET = 'auth.password_reset',

  // Stylist invitation events — pushed to the notifications queue by auth-service
  STYLIST_INVITATION_ACCEPTED = 'stylist.invitation_accepted',
  STYLIST_INVITATION_REJECTED = 'stylist.invitation_rejected',
  STYLIST_SALON_INVITATION    = 'stylist.salon_invitation',

  // Waitlist — emitted by booking-service to the bookings queue when a slot opens
  WAITLIST_SLOT_AVAILABLE = 'waitlist.slot-available',
}

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

export enum TemplateType {
  // ── Client-facing ─────────────────────────────────────────────────────────
  BOOKING_CREATED           = 'booking_created',
  BOOKING_CONFIRMED         = 'booking_confirmed',
  BOOKING_CANCELLED         = 'booking_cancelled',
  BOOKING_COMPLETED         = 'booking_completed',
  BOOKING_REVIEW_REQUEST    = 'booking_review_request',
  /** Delayed email + push nudge (2h after completion) — uses {{reviewUrl}} */
  REVIEW_NUDGE              = 'review_nudge',
  BOOKING_REMINDER_24HR     = 'booking_reminder_24hr',
  BOOKING_REMINDER_2HR      = 'booking_reminder_2hr',

  // ── Salon-owner-facing ────────────────────────────────────────────────────
  /** Owner receives this when a client places a new booking */
  BOOKING_CREATED_OWNER     = 'booking_created_owner',
  /** Owner receives this when they confirm a booking */
  BOOKING_CONFIRMED_OWNER   = 'booking_confirmed_owner',
  /** Owner receives this when a booking is cancelled (any party) */
  BOOKING_CANCELLED_OWNER   = 'booking_cancelled_owner',
  /** Owner receives this when a booking is marked completed */
  BOOKING_COMPLETED_OWNER   = 'booking_completed_owner',

  // ── Stylist-facing ────────────────────────────────────────────────────────
  /** Stylist receives this when a booking is assigned to them */
  BOOKING_CREATED_STYLIST   = 'booking_created_stylist',
  /** Stylist receives this when their appointment is confirmed */
  BOOKING_CONFIRMED_STYLIST = 'booking_confirmed_stylist',
  /** Stylist receives this when an assigned booking is cancelled */
  BOOKING_CANCELLED_STYLIST = 'booking_cancelled_stylist',
  /** Stylist receives a 24-hour reminder for their next appointment */
  BOOKING_REMINDER_24HR_STYLIST = 'booking_reminder_24hr_stylist',

  // ── Waitlist ─────────────────────────────────────────────────────────────
  /** Email sent to client when a slot they waitlisted for becomes available */
  WAITLIST_SLOT_AVAILABLE   = 'waitlist_slot_available',
}

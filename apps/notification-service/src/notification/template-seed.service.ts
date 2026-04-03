import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NotificationTemplate,
  NotificationTemplateDocument,
} from './schemas/notification-template.schema';
import {
  NotificationChannel,
  TemplateType,
} from './constants/notification-events.constants';

interface TemplateSeed {
  type: TemplateType;
  channel: NotificationChannel;
  name: string;
  subject: string;
  body: string;
}

const SEEDS: TemplateSeed[] = [

  // ════════════════════════════════════════════════════════════════════════
  // CLIENT — BOOKING CREATED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CREATED,
    channel: NotificationChannel.EMAIL,
    name: 'Booking Request Received — Client (Email)',
    subject: 'Booking Request at {{salonName}} — {{date}} at {{time}}',
    body: `Dear {{clientName}},

Thank you for choosing {{salonName}}. We have successfully received your booking request, which is currently awaiting confirmation from our team.

Booking Summary
───────────────────────────
Service:    {{serviceName}}
Date:       {{date}}
Time:       {{time}}
Amount Due: LKR {{totalPrice}}
───────────────────────────

You will receive a confirmation email as soon as your appointment has been approved. Should you have any questions in the meantime, please do not hesitate to contact the salon directly.

We look forward to welcoming you.

Warm regards,
The {{salonName}} Team`,
  },
  {
    type: TemplateType.BOOKING_CREATED,
    channel: NotificationChannel.SMS,
    name: 'Booking Request Received — Client (SMS)',
    subject: 'Booking Request Received',
    body: 'Dear {{clientName}}, thank you for booking at {{salonName}}. Your request for {{serviceName}} on {{date}} at {{time}} (LKR {{totalPrice}}) has been received and is awaiting confirmation.',
  },

  // ════════════════════════════════════════════════════════════════════════
  // CLIENT — BOOKING CONFIRMED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CONFIRMED,
    channel: NotificationChannel.EMAIL,
    name: 'Booking Confirmed — Client (Email)',
    subject: 'Appointment Confirmed at {{salonName}} — {{date}} at {{time}}',
    body: `Dear {{clientName}},

Wonderful news! Your appointment at {{salonName}} has been confirmed, and we are looking forward to seeing you.

Appointment Details
───────────────────────────
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
Location:  {{address}}
Total:     LKR {{totalPrice}}
───────────────────────────

We recommend arriving 5–10 minutes before your scheduled time so we can get started promptly. Should you need to reschedule or cancel, please contact us at least 24 hours in advance.

We look forward to providing you with an exceptional experience.

Warm regards,
The {{salonName}} Team`,
  },
  {
    type: TemplateType.BOOKING_CONFIRMED,
    channel: NotificationChannel.SMS,
    name: 'Booking Confirmed — Client (SMS)',
    subject: 'Appointment Confirmed',
    body: 'Dear {{clientName}}, your {{serviceName}} appointment at {{salonName}} on {{date}} at {{time}} is confirmed. Please arrive a few minutes early. See you soon!',
  },

  // ════════════════════════════════════════════════════════════════════════
  // CLIENT — BOOKING CANCELLED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CANCELLED,
    channel: NotificationChannel.EMAIL,
    name: 'Booking Cancelled — Client (Email)',
    subject: 'Booking Cancelled at {{salonName}} — {{date}} at {{time}}',
    body: `Dear {{clientName}},

We are writing to inform you that your booking at {{salonName}} has been cancelled.

Cancelled Booking Details
───────────────────────────
Service:  {{serviceName}}
Date:     {{date}}
Time:     {{time}}
Reason:   {{reason}}
───────────────────────────

We sincerely apologise for any inconvenience this may have caused. We would be delighted to help you schedule a new appointment at a time that suits you.

Should you have any questions or concerns, please do not hesitate to reach out to us.

Kind regards,
The {{salonName}} Team`,
  },
  {
    type: TemplateType.BOOKING_CANCELLED,
    channel: NotificationChannel.SMS,
    name: 'Booking Cancelled — Client (SMS)',
    subject: 'Booking Cancelled',
    body: 'Dear {{clientName}}, your {{serviceName}} booking at {{salonName}} on {{date}} at {{time}} has been cancelled. Reason: {{reason}}. We apologise for any inconvenience.',
  },

  // ════════════════════════════════════════════════════════════════════════
  // CLIENT — BOOKING COMPLETED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_COMPLETED,
    channel: NotificationChannel.EMAIL,
    name: 'Booking Completed — Client (Email)',
    subject: 'Thank You for Your Visit at {{salonName}} — {{date}}',
    body: `Dear {{clientName}},

Thank you for choosing {{salonName}} for your {{serviceName}} on {{date}}. It was truly a pleasure to have you with us.

We hope you are absolutely delighted with the results. Your satisfaction is our highest priority, and we would love to welcome you back again soon.

A brief follow-up message with a link to share your experience will be sent to you shortly. Your feedback helps us continue delivering the best possible service to every client.

We look forward to seeing you again.

Warm regards,
The {{salonName}} Team`,
  },
  {
    type: TemplateType.BOOKING_COMPLETED,
    channel: NotificationChannel.SMS,
    name: 'Booking Completed — Client (SMS)',
    subject: 'Visit Complete',
    body: 'Thank you for visiting {{salonName}}, {{clientName}}! We hope you enjoyed your {{serviceName}}. A review request will be sent to you shortly. We look forward to seeing you again.',
  },

  // ════════════════════════════════════════════════════════════════════════
  // CLIENT — REVIEW REQUEST
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_REVIEW_REQUEST,
    channel: NotificationChannel.EMAIL,
    name: 'Review Request — Client (Email)',
    subject: 'How Was Your Visit to {{salonName}} on {{date}}?',
    body: `Dear {{clientName}},

We hope you are enjoying the results of your {{serviceName}} at {{salonName}} on {{date}}.

At SnapSalon, we are committed to providing an exceptional experience for every client, and your feedback plays a vital role in helping us achieve that. We would be very grateful if you could take a moment to share your thoughts.

Share your experience here:
{{reviewLink}}

It only takes a minute, and it makes a real difference — both to our team and to other clients who are looking for the right salon.

Thank you sincerely for choosing {{salonName}}. We hope to see you again very soon.

Warm regards,
The {{salonName}} Team`,
  },
  {
    type: TemplateType.REVIEW_NUDGE,
    channel: NotificationChannel.EMAIL,
    name: 'Review Nudge — Client (Email)',
    subject: 'How was your visit to {{salonName}}?',
    body: `Dear {{clientName}},

Thank you for visiting {{salonName}}. We hope you had a great experience.

If you have a moment, we would really appreciate a short review — it helps other clients and helps us keep improving.

Leave your review here:
{{reviewUrl}}

Thank you again, and we hope to see you soon.

Warm regards,
The {{salonName}} Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // CLIENT — REMINDER 24 HOURS
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_REMINDER_24HR,
    channel: NotificationChannel.EMAIL,
    name: 'Appointment Reminder 24hr — Client (Email)',
    subject: 'Reminder: Your Appointment at {{salonName}} Tomorrow at {{time}}',
    body: `Dear {{clientName}},

This is a friendly reminder that you have an appointment scheduled at {{salonName}} tomorrow. We are looking forward to seeing you!

Appointment Details
───────────────────────────
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
Location:  {{address}}
───────────────────────────

We recommend arriving 5–10 minutes before your scheduled time. Should you need to make any changes to your appointment, please contact us as soon as possible.

We look forward to welcoming you tomorrow.

Warm regards,
The {{salonName}} Team`,
  },
  {
    type: TemplateType.BOOKING_REMINDER_24HR,
    channel: NotificationChannel.SMS,
    name: 'Appointment Reminder 24hr — Client (SMS)',
    subject: 'Appointment Tomorrow',
    body: 'Reminder, {{clientName}}: your {{serviceName}} appointment at {{salonName}} is tomorrow, {{date}} at {{time}}. Location: {{address}}. See you then!',
  },

  // ════════════════════════════════════════════════════════════════════════
  // CLIENT — REMINDER 2 HOURS
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_REMINDER_2HR,
    channel: NotificationChannel.EMAIL,
    name: 'Appointment Reminder 2hr — Client (Email)',
    subject: 'Reminder: Your Appointment at {{salonName}} at {{time}} Today',
    body: `Dear {{clientName}},

Just a quick reminder that your appointment at {{salonName}} is coming up in just 2 hours. We cannot wait to see you!

Appointment Details
───────────────────────────
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
Location:  {{address}}
───────────────────────────

Please ensure you are on your way. If you need to reach us, please do so immediately.

See you very soon!

Warm regards,
The {{salonName}} Team`,
  },
  {
    type: TemplateType.BOOKING_REMINDER_2HR,
    channel: NotificationChannel.SMS,
    name: 'Appointment Reminder 2hr — Client (SMS)',
    subject: 'Appointment in 2 Hours',
    body: 'Reminder, {{clientName}}: your {{serviceName}} at {{salonName}} starts in 2 hours at {{time}}. Location: {{address}}. See you soon!',
  },

  // ════════════════════════════════════════════════════════════════════════
  // SALON OWNER — BOOKING CREATED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CREATED_OWNER,
    channel: NotificationChannel.EMAIL,
    name: 'New Booking Alert — Salon Owner (Email)',
    subject: 'New Booking: {{clientName}} · {{date}} at {{time}} — {{salonName}}',
    body: `Dear {{ownerName}},

A new booking has been placed at {{salonName}} and is awaiting your confirmation.

New Booking Details
───────────────────────────
Client:    {{clientName}}
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
Total:     LKR {{totalPrice}}
───────────────────────────

Please log in to your SnapSalon dashboard at your earliest convenience to confirm or manage this appointment.

Regards,
The SnapSalon Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // SALON OWNER — BOOKING CONFIRMED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CONFIRMED_OWNER,
    channel: NotificationChannel.EMAIL,
    name: 'Booking Confirmed — Salon Owner (Email)',
    subject: 'Booking Confirmed: {{clientName}} on {{date}} at {{time}}',
    body: `Dear {{ownerName}},

The following appointment at {{salonName}} has been confirmed.

Confirmed Booking Details
───────────────────────────
Client:    {{clientName}}
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
Total:     LKR {{totalPrice}}
───────────────────────────

You can view and manage all upcoming appointments from your SnapSalon dashboard.

Regards,
The SnapSalon Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // SALON OWNER — BOOKING CANCELLED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CANCELLED_OWNER,
    channel: NotificationChannel.EMAIL,
    name: 'Booking Cancelled — Salon Owner (Email)',
    subject: 'Booking Cancelled: {{clientName}} on {{date}} at {{time}}',
    body: `Dear {{ownerName}},

Please be advised that the following booking at {{salonName}} has been cancelled.

Cancelled Booking Details
───────────────────────────
Client:    {{clientName}}
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
Reason:    {{reason}}
───────────────────────────

The time slot has been freed in your calendar. Please log in to your SnapSalon dashboard to review your updated schedule.

Regards,
The SnapSalon Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // SALON OWNER — BOOKING COMPLETED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_COMPLETED_OWNER,
    channel: NotificationChannel.EMAIL,
    name: 'Booking Completed — Salon Owner (Email)',
    subject: 'Appointment Completed: {{clientName}} at {{salonName}} — {{date}}',
    body: `Dear {{ownerName}},

The following appointment at {{salonName}} has been successfully completed.

Completed Appointment Details
───────────────────────────
Client:    {{clientName}}
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
Total:     LKR {{totalPrice}}
───────────────────────────

A review request has been automatically sent to the client. Positive reviews help grow your salon's visibility on SnapSalon.

Regards,
The SnapSalon Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // STYLIST — BOOKING CREATED (new appointment assigned)
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CREATED_STYLIST,
    channel: NotificationChannel.EMAIL,
    name: 'New Appointment Assigned — Stylist (Email)',
    subject: 'New Appointment: {{clientName}} · {{date}} at {{time}} — {{salonName}}',
    body: `Dear {{stylistName}},

A new appointment has been assigned to you at {{salonName}}. Please review the details below and prepare accordingly.

Appointment Details
───────────────────────────
Client:    {{clientName}}
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
───────────────────────────

Please log in to your SnapSalon dashboard to view the full appointment details and any client notes.

Regards,
The SnapSalon Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // STYLIST — BOOKING CONFIRMED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CONFIRMED_STYLIST,
    channel: NotificationChannel.EMAIL,
    name: 'Appointment Confirmed — Stylist (Email)',
    subject: 'Appointment Confirmed: {{clientName}} on {{date}} at {{time}}',
    body: `Dear {{stylistName}},

Your upcoming appointment at {{salonName}} has been confirmed. Please ensure you are available and prepared at the scheduled time.

Confirmed Appointment Details
───────────────────────────
Client:    {{clientName}}
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
───────────────────────────

You can view all your upcoming appointments from your SnapSalon dashboard.

Regards,
The SnapSalon Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // STYLIST — BOOKING CANCELLED
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_CANCELLED_STYLIST,
    channel: NotificationChannel.EMAIL,
    name: 'Appointment Cancelled — Stylist (Email)',
    subject: 'Appointment Cancelled: {{clientName}} on {{date}} at {{time}}',
    body: `Dear {{stylistName}},

Please be advised that the following appointment assigned to you at {{salonName}} has been cancelled.

Cancelled Appointment Details
───────────────────────────
Client:    {{clientName}}
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
Reason:    {{reason}}
───────────────────────────

Your schedule has been updated accordingly. Please log in to your SnapSalon dashboard to review your remaining upcoming appointments.

Regards,
The SnapSalon Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // STYLIST — REMINDER 24 HOURS
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.BOOKING_REMINDER_24HR_STYLIST,
    channel: NotificationChannel.EMAIL,
    name: 'Appointment Reminder 24hr — Stylist (Email)',
    subject: 'Reminder: Appointment Tomorrow — {{clientName}} at {{time}}',
    body: `Dear {{stylistName}},

This is a reminder that you have an appointment scheduled tomorrow at {{salonName}}. Please ensure you are fully prepared for the session.

Tomorrow's Appointment
───────────────────────────
Client:    {{clientName}}
Service:   {{serviceName}}
Date:      {{date}}
Time:      {{time}}
───────────────────────────

You can view all your upcoming appointments and any client notes from your SnapSalon dashboard.

Regards,
The SnapSalon Team`,
  },

  // ════════════════════════════════════════════════════════════════════════
  // WAITLIST — SLOT AVAILABLE
  // ════════════════════════════════════════════════════════════════════════
  {
    type: TemplateType.WAITLIST_SLOT_AVAILABLE,
    channel: NotificationChannel.EMAIL,
    name: 'Waitlist — Slot Available (Email)',
    subject: 'Good news! A slot opened at {{salonName}} on {{date}} at {{time}}',
    body: `Dear {{clientName}},

Great news — a slot you were waiting for has just become available!

Salon:   {{salonName}}
Date:    {{date}}
Time:    {{time}}

Slots fill up quickly, so we recommend booking as soon as possible.

👉 Book now: {{bookingUrl}}

If you no longer need this slot, you can ignore this email and your waitlist entry will expire automatically.

Warm regards,
The SnapSalon Team`,
  },
];

@Injectable()
export class TemplateSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TemplateSeedService.name);

  constructor(
    @InjectModel(NotificationTemplate.name)
    private readonly templateModel: Model<NotificationTemplateDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.dropLegacyIndex();

    let seeded = 0;

    for (const seed of SEEDS) {
      // $set updates subject/body on every restart so code changes are always
      // reflected without having to manually delete DB documents.
      // active is only written on first insert ($setOnInsert) so manually
      // disabled templates stay disabled across restarts.
      const result = await this.templateModel.updateOne(
        { type: seed.type, channel: seed.channel },
        {
          $set:          { name: seed.name, subject: seed.subject, body: seed.body },
          $setOnInsert:  { type: seed.type, channel: seed.channel, active: true },
        },
        { upsert: true },
      );
      if (result.upsertedCount > 0) {
        seeded++;
        this.logger.log(`Seeded template: type=${seed.type} channel=${seed.channel}`);
      } else if (result.modifiedCount > 0) {
        this.logger.debug(`Updated template: type=${seed.type} channel=${seed.channel}`);
      }
    }

    if (seeded > 0) {
      this.logger.log(`Template seed complete — inserted ${seeded} new template(s).`);
    } else {
      this.logger.debug('Template seed complete — all templates already present (any changes applied).');
    }
  }

  /**
   * Drop the legacy single-field unique index on `type` if it still exists.
   * It was replaced by a compound unique index on { type, channel } — the old
   * index blocks upserts that insert multiple channels for the same type.
   */
  private async dropLegacyIndex(): Promise<void> {
    try {
      const collection = this.templateModel.collection;
      const indexes = await collection.indexes();
      const legacy = indexes.find((idx) => idx.name === 'type_1');
      if (legacy) {
        await collection.dropIndex('type_1');
        this.logger.log('Dropped legacy type_1 index — replaced by compound {type, channel} index.');
      }
    } catch (err: unknown) {
      this.logger.warn(`Could not check/drop legacy index: ${String(err)}`);
    }
  }
}

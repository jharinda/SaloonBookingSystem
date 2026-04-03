import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { SubscriptionCheckModule } from '@org/subscription-check';

import {
  BOOKING_QUEUE,
  NOTIFICATION_QUEUE,
} from './constants/notification-events.constants';
import {
  NotificationTemplate,
  NotificationTemplateSchema,
} from './schemas/notification-template.schema';
import {
  NotificationLog,
  NotificationLogSchema,
} from './schemas/notification-log.schema';
import {
  InboxNotification,
  InboxNotificationSchema,
} from './schemas/inbox-notification.schema';
import { TemplateService } from './template.service';
import { TemplateSeedService } from './template-seed.service';
import { EmailService } from './providers/email.service';
import { SmsService } from './providers/sms.service';
import { WhatsAppService } from './providers/whatsapp.service';
import { SsePushService } from './providers/sse-push.service';
import { PushNotificationService } from './providers/push-notification.service';
import { fcmProvider } from './providers/fcm.provider';
import { InboxNotificationService } from './inbox-notification.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { BookingCreatedProcessor } from './processors/booking-created.processor';
import { BookingLifecycleProcessor } from './processors/booking-lifecycle.processor';
import { ReminderNotificationProcessor } from './processors/reminder-notification.processor';
import { AuthNotificationProcessor } from './processors/auth-notification.processor';
import { InvitationNotificationProcessor } from './processors/invitation-notification.processor';
import { ReviewNudgeProcessor } from './processors/review-nudge.processor';
import { WaitlistNotificationProcessor } from './processors/waitlist-notification.processor';
import { NotificationController } from './notification.controller';
import {
  EMAIL_SERVICE,
  SMS_SERVICE,
  WHATSAPP_SERVICE,
  PUSH_NOTIFICATION_SERVICE,
} from './interfaces/notification-channel.interface';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
    SubscriptionCheckModule.forRoot(),
    MongooseModule.forFeature([
      { name: NotificationTemplate.name, schema: NotificationTemplateSchema },
      { name: NotificationLog.name, schema: NotificationLogSchema },
      { name: InboxNotification.name, schema: InboxNotificationSchema },
    ]),
    // Consume events emitted by booking-service
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
    // Consume reminder events from a scheduler
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [NotificationController],
  providers: [
    TemplateService,
    TemplateSeedService,

    // ── DIP: abstract token → concrete implementation (swap with one line) ──
    EmailService,
    { provide: EMAIL_SERVICE, useExisting: EmailService },
    SmsService,
    { provide: SMS_SERVICE, useExisting: SmsService },
    WhatsAppService,
    { provide: WHATSAPP_SERVICE, useExisting: WhatsAppService },
    PushNotificationService,
    { provide: PUSH_NOTIFICATION_SERVICE, useExisting: PushNotificationService },

    SsePushService,
    fcmProvider,
    InboxNotificationService,
    NotificationDispatchService,

    // ── Processors (SRP: one concern per processor) ─────────────────────────
    BookingCreatedProcessor,
    BookingLifecycleProcessor,
    ReminderNotificationProcessor,
    AuthNotificationProcessor,
    InvitationNotificationProcessor,
    ReviewNudgeProcessor,    WaitlistNotificationProcessor,  ],
})
export class NotificationModule {}

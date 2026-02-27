import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';

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
import { TemplateService } from './template.service';
import { EmailService } from './providers/email.service';
import { SmsService } from './providers/sms.service';
import { WhatsAppService } from './providers/whatsapp.service';
import { BookingNotificationProcessor } from './processors/booking-notification.processor';
import { ReminderNotificationProcessor } from './processors/reminder-notification.processor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationTemplate.name, schema: NotificationTemplateSchema },
      { name: NotificationLog.name, schema: NotificationLogSchema },
    ]),
    // Consume events emitted by booking-service
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
    // Consume reminder events from a scheduler
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers: [
    TemplateService,
    EmailService,
    SmsService,
    WhatsAppService,
    BookingNotificationProcessor,
    ReminderNotificationProcessor,
  ],
})
export class NotificationModule {}

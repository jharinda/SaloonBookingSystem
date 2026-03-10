import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { SubscriptionCheckModule } from '@org/subscription-check';

import { BOOKING_QUEUE } from './constants/calendar-events.constants';
import { GoogleToken, GoogleTokenSchema } from './schemas/google-token.schema';
import { Booking, BookingRefSchema } from './schemas/booking-ref.schema';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleCalendarService } from './google-calendar.service';
import { ICalService } from './ical.service';
import { CalendarController } from './calendar.controller';
import { CalendarEventProcessor } from './processors/calendar-event.processor';
import { SharedAuthModule } from '@org/shared-auth';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    SubscriptionCheckModule.forRoot(),
    MongooseModule.forFeature([
      { name: GoogleToken.name, schema: GoogleTokenSchema },
      { name: Booking.name, schema: BookingRefSchema },
    ]),
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
  ],
  controllers: [CalendarController],
  providers: [
    GoogleOAuthService,
    GoogleCalendarService,
    ICalService,
    CalendarEventProcessor,
  ],
  exports: [GoogleOAuthService, GoogleCalendarService, ICalService],
})
export class CalendarModule {}

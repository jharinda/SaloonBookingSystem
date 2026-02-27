import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { PassportModule } from '@nestjs/passport';

import { BOOKING_QUEUE } from './constants/calendar-events.constants';
import { GoogleToken, GoogleTokenSchema } from './schemas/google-token.schema';
import { Booking, BookingRefSchema } from './schemas/booking-ref.schema';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleCalendarService } from './google-calendar.service';
import { ICalService } from './ical.service';
import { CalendarController } from './calendar.controller';
import { CalendarEventProcessor } from './processors/calendar-event.processor';
import { JwtStrategy } from '../common/strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: GoogleToken.name, schema: GoogleTokenSchema },
      { name: Booking.name, schema: BookingRefSchema },
    ]),
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
  ],
  controllers: [CalendarController],
  providers: [
    GoogleOAuthService,
    GoogleCalendarService,
    ICalService,
    CalendarEventProcessor,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [GoogleOAuthService, GoogleCalendarService, ICalService],
})
export class CalendarModule {}

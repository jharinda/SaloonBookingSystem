import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';

import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { StylistBreakService } from './stylist-break.service';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { StylistBreak, StylistBreakSchema } from './schemas/stylist-break.schema';
import { WaitlistEntry, WaitlistEntrySchema } from './schemas/waitlist.schema';
import { BookingProcessor } from './processors/booking.processor';
import { BOOKING_QUEUE } from './constants/booking-events.constants';
import { SharedAuthModule } from '@org/shared-auth';
import { SubscriptionCheckModule } from '@org/subscription-check';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    SubscriptionCheckModule.forRoot(),
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: StylistBreak.name, schema: StylistBreakSchema },
      { name: WaitlistEntry.name, schema: WaitlistEntrySchema },
    ]),
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'calendar' }),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    StylistBreakService,
    BookingProcessor,
  ],
  exports: [BookingService],
})
export class BookingModule {}

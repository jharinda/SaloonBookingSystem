import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import Redis from 'ioredis';

import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { BookingProcessor } from './processors/booking.processor';
import { BOOKING_QUEUE } from './constants/booking-events.constants';
import { SharedAuthModule } from '@org/shared-auth';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
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
    BookingProcessor,
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
          lazyConnect: true,
        }),
    },
  ],
  exports: [BookingService],
})
export class BookingModule {}

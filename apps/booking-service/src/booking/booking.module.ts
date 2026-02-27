import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import Redis from 'ioredis';

import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { BookingProcessor } from './processors/booking.processor';
import { BOOKING_QUEUE } from './constants/booking-events.constants';
import { JwtStrategy, JwtAuthGuard, RolesGuard } from '@org/shared-auth';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
    HttpModule,
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingProcessor,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          lazyConnect: true,
        }),
    },
  ],
  exports: [BookingService],
})
export class BookingModule {}

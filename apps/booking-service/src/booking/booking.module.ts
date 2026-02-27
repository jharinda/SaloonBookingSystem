import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { PassportModule } from '@nestjs/passport';

import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { BookingProcessor } from './processors/booking.processor';
import { BOOKING_QUEUE } from './constants/booking-events.constants';
import { JwtStrategy } from '../common/strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
  ],
  controllers: [BookingController],
  providers: [BookingService, BookingProcessor, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [BookingService],
})
export class BookingModule {}

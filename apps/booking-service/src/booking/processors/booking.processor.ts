import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { BOOKING_QUEUE, BookingEvent } from '../constants/booking-events.constants';
import { BookingResponseDto } from '../dto/booking-response.dto';

@Processor(BOOKING_QUEUE)
export class BookingProcessor {
  private readonly logger = new Logger(BookingProcessor.name);

  @Process(BookingEvent.CREATED)
  handleBookingCreated(job: Job<BookingResponseDto>): void {
    this.logger.log(
      `[${BookingEvent.CREATED}] bookingId=${job.data.id} salonId=${job.data.salonId}`,
    );
    // TODO: trigger notification-service (email/SMS confirmation to client)
  }

  @Process(BookingEvent.CONFIRMED)
  handleBookingConfirmed(job: Job<BookingResponseDto>): void {
    this.logger.log(
      `[${BookingEvent.CONFIRMED}] bookingId=${job.data.id}`,
    );
    // TODO: trigger Google Calendar event creation via calendar-service
  }

  @Process(BookingEvent.CANCELLED)
  handleBookingCancelled(
    job: Job<{ booking: BookingResponseDto; reason: string }>,
  ): void {
    this.logger.log(
      `[${BookingEvent.CANCELLED}] bookingId=${job.data.booking.id} reason="${job.data.reason}"`,
    );
    // TODO: notify affected parties, remove calendar event
  }

  @Process(BookingEvent.COMPLETED)
  handleBookingCompleted(job: Job<BookingResponseDto>): void {
    this.logger.log(
      `[${BookingEvent.COMPLETED}] bookingId=${job.data.id}`,
    );
    // TODO: trigger review-service prompt to client
  }
}

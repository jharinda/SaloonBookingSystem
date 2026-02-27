import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailableSlotsQueryDto, BookingListQueryDto } from './dto/booking-query.dto';
import {
  AvailableSlotsResponseDto,
  BookingResponseDto,
  PaginatedBookingsDto,
} from './dto/booking-response.dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, JwtUser, UserRole } from '@org/shared-auth';
import { IsString, IsNotEmpty } from 'class-validator';

class CancelBookingDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ── Public / availability ─────────────────────────────────────────────────

  @Get('slots')
  async getAvailableSlots(
    @Query() query: AvailableSlotsQueryDto,
  ): Promise<AvailableSlotsResponseDto> {
    return this.bookingService.getAvailableSlots(
      query.salonId,
      query.stylistId ?? null,
      query.date,
      query.durationMinutes,
    );
  }

  // ── Client routes ─────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BookingResponseDto> {
    return this.bookingService.createBooking(dto, user.sub);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async myBookings(
    @Query() query: BookingListQueryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<PaginatedBookingsDto> {
    return this.bookingService.findAll(query, {
      clientId: user.sub,
    });
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BookingResponseDto> {
    return this.bookingService.cancelBooking(id, user.sub, dto.reason);
  }

  // ── Salon-owner routes ────────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async findAll(
    @Query() query: BookingListQueryDto,
  ): Promise<PaginatedBookingsDto> {
    return this.bookingService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.findById(id);
  }

  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async confirm(
    @Param('id') id: string,
  ): Promise<BookingResponseDto> {
    return this.bookingService.confirmBooking(id);
  }

  /** Internal route — called by calendar-service to persist the Google Calendar event ID */
  @Patch(':id/google-event')
  async setGoogleEventId(
    @Param('id') id: string,
    @Body() body: { googleEventId: string },
  ): Promise<BookingResponseDto> {
    return this.bookingService.setGoogleEventId(id, body.googleEventId);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async complete(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.completeBooking(id);
  }
}

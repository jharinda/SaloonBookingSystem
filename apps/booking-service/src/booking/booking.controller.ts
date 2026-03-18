import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { BookingService } from './booking.service';
import { StylistBreakService } from './stylist-break.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailableSlotsQueryDto, BookingListQueryDto } from './dto/booking-query.dto';
import { CreateStylistBreakDto } from './dto/stylist-break.dto';
import {
  AvailableSlotsResponseDto,
  BookingResponseDto,
  PaginatedBookingsDto,
} from './dto/booking-response.dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, JwtUser, UserRole } from '@org/shared-auth';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { AssignStationDto } from './dto/assign-station.dto';

@Controller('bookings')
export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly breakService: StylistBreakService,
  ) {}

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

  /**
   * Public endpoint — returns the list of stylist IDs who have at least one
   * break on the given date for the specified salon.
   * Used by the booking wizard to disable on-break stylists.
   */
  @Get('breaks/stylists-on-break')
  async stylistsOnBreak(
    @Query('salonId') salonId: string,
    @Query('date') date: string,
    @Query('time') time?: string,
    @Query('durationMinutes') durationMinutes?: string,
  ): Promise<{ stylistIds: string[] }> {
    return this.breakService.getStylistIdsOnBreak(
      salonId,
      date,
      time,
      durationMinutes ? parseInt(durationMinutes, 10) : undefined,
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
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
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
    return this.bookingService.cancelBooking(id, user.sub, user.role, dto.reason);
  }

  @Patch(':id/reschedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BookingResponseDto> {
    return this.bookingService.rescheduleBooking(id, dto, user.sub);
  }

  // ── Stylist routes ─────────────────────────────────────────────────────────

  @Get('stylist/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async myStylistBookings(
    @Query() query: BookingListQueryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<PaginatedBookingsDto> {
    const result = await this.bookingService.findAll(query, {
      stylistId: user.sub,
    });
    return result;
  }

  @Get('stylist/me/breaks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async myBreaks(
    @Query('date') date: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.breakService.findByDate(user.sub, date);
  }

  @Post('stylist/me/breaks')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async createBreak(
    @Body() dto: CreateStylistBreakDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.breakService.create(user.sub, dto);
  }

  @Delete('stylist/me/breaks/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async deleteBreak(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.breakService.delete(user.sub, id);
  }

  // ── Salon-owner routes ────────────────────────────────────────────────────

  @Get('salon/:salonId/breaks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async salonBreaks(
    @Param('salonId') salonId: string,
    @Query('date') date: string,
  ) {
    return this.breakService.findBySalonAndDate(salonId, date);
  }

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

  /** Internal route — no auth guard, for service-to-service calls only */
  @Get('internal/:id')
  async findOneInternal(@Param('id') id: string): Promise<BookingResponseDto> {
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

  /** Internal route — called by calendar-service to report sync outcome */
  @Patch(':id/calendar-sync-status')
  async updateCalendarSyncStatus(
    @Param('id') id: string,
    @Body() body: { status: 'pending' | 'synced' | 'failed' },
  ): Promise<BookingResponseDto> {
    return this.bookingService.updateCalendarSyncStatus(id, body.status);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async complete(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.completeBooking(id);
  }

  @Patch(':id/station')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async assignStation(
    @Param('id') id: string,
    @Body() dto: AssignStationDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BookingResponseDto> {
    return this.bookingService.assignStation(id, dto.stationId, user.sub);
  }
}

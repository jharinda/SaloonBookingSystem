import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { BookingService } from './booking.service';
import { StylistBreakService } from './stylist-break.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateManualBookingDto } from './dto/create-manual-booking.dto';
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
import { ModifyBookingDto } from './dto/modify-booking.dto';
import { AssignStationDto } from './dto/assign-station.dto';
import {
  SalonAnalyticsResponseDto,
  SalonAnalyticsResponseSwaggerDto,
  ClientAnalyticsResponseDto,
} from './dto/analytics.dto';
import { JoinWaitlistDto, WaitlistEntryResponseDto } from './dto/waitlist.dto';
import { BookingStatus } from '@org/models';

@ApiTags('bookings')
@ApiBearerAuth('JWT')
@Controller('bookings')
export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly breakService: StylistBreakService,
    private readonly configService: ConfigService,
  ) {}

  // ── Public / availability ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get available booking slots for a salon on a date' })
  @ApiQuery({ name: 'salonId', required: true, description: 'Salon ID' })
  @ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format' })
  @ApiQuery({ name: 'durationMinutes', required: true, type: Number, description: 'Total duration in minutes' })
  @ApiQuery({ name: 'stylistId', required: false, description: 'Optional stylist ID' })
  @ApiResponse({ status: 200, description: 'Available time slots' })
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
  @ApiOperation({ summary: 'List stylist IDs on break for a salon and date' })
  @ApiQuery({ name: 'salonId', required: true, description: 'Salon ID' })
  @ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format' })
  @ApiQuery({ name: 'time', required: false, description: 'Optional time (HH:mm) for overlap check' })
  @ApiQuery({ name: 'durationMinutes', required: false, type: Number, description: 'Optional duration for overlap' })
  @ApiResponse({ status: 200, description: 'Stylist IDs on break' })
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

  // ── Manual booking (salon-owner) ────────────────────────────────────────

  @ApiOperation({ summary: 'Create a manual booking (salon owner)' })
  @ApiResponse({ status: 201, description: 'Booking created' })
  @Post('manual')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async createManual(
    @Body() dto: CreateManualBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingService.createManualBooking(dto);
  }

  // ── Client routes ─────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a booking (client)' })
  @ApiResponse({ status: 201, description: 'Booking created' })
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

  @ApiOperation({ summary: 'List current client bookings' })
  @ApiQuery({ name: 'salonId', required: false })
  @ApiQuery({ name: 'stylistId', required: false })
  @ApiQuery({ name: 'serviceId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['appointment', 'createdAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated bookings' })
  @Get('my')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async myBookings(
    @Query() query: BookingListQueryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<PaginatedBookingsDto> {
    return this.bookingService.findAll(query, {
      clientId: user.sub,
    });
  }

  @ApiOperation({ summary: 'Client personal booking analytics' })
  @ApiResponse({ status: 200, description: 'Client analytics data' })
  @Get('analytics/me')
  @UseGuards(JwtAuthGuard)
  async getMyAnalytics(
    @CurrentUser() user: JwtUser,
  ): Promise<ClientAnalyticsResponseDto> {
    return this.bookingService.getClientAnalytics(user.sub);
  }

  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking cancelled' })
  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BookingResponseDto> {
    return this.bookingService.cancelBooking(id, user.sub, user.role, dto.reason);
  }

  @ApiOperation({ summary: 'Reschedule a booking (client)' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking rescheduled' })
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

  @ApiOperation({ summary: 'Modify services / stylist / notes on a booking (client)' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking modified' })
  @Patch(':id/modify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async modifyBooking(
    @Param('id') id: string,
    @Body() dto: ModifyBookingDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BookingResponseDto> {
    return this.bookingService.modifyBooking(id, dto, user.sub);
  }

  // ── Stylist routes ─────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List current stylist bookings' })
  @ApiQuery({ name: 'salonId', required: false })
  @ApiQuery({ name: 'stylistId', required: false })
  @ApiQuery({ name: 'serviceId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['appointment', 'createdAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated bookings' })
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

  @ApiOperation({ summary: 'List stylist breaks for a date' })
  @ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({ status: 200, description: 'Breaks for the stylist' })
  @Get('stylist/me/breaks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STYLIST)
  async myBreaks(
    @Query('date') date: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.breakService.findByDate(user.sub, date);
  }

  @ApiOperation({ summary: 'Create a stylist break' })
  @ApiResponse({ status: 201, description: 'Break created' })
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

  @ApiOperation({ summary: 'Delete a stylist break' })
  @ApiParam({ name: 'id', description: 'Break ID' })
  @ApiResponse({ status: 200, description: 'Break deleted' })
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

  @ApiOperation({ summary: 'List breaks for a salon and date (owner/admin)' })
  @ApiParam({ name: 'salonId', description: 'Salon ID' })
  @ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({ status: 200, description: 'Breaks for the salon' })
  @Get('salon/:salonId/breaks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async salonBreaks(
    @Param('salonId') salonId: string,
    @Query('date') date: string,
  ) {
    return this.breakService.findBySalonAndDate(salonId, date);
  }

  @ApiOperation({ summary: 'List bookings (salon owner / admin)' })
  @ApiQuery({ name: 'salonId', required: false })
  @ApiQuery({ name: 'stylistId', required: false })
  @ApiQuery({ name: 'serviceId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['appointment', 'createdAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated bookings' })
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async findAll(
    @Query() query: BookingListQueryDto,
  ): Promise<PaginatedBookingsDto> {
    return this.bookingService.findAll(query);
  }

  @ApiOperation({ summary: 'Platform-wide booking stats (super admin)' })
  @ApiResponse({ status: 200, description: 'Platform booking statistics' })
  @Get('admin/platform-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getPlatformStats() {
    return this.bookingService.getPlatformStats();
  }

  @ApiOperation({
    summary: 'Salon analytics (revenue over time, status breakdown, peak hours, top services)',
  })
  @ApiParam({ name: 'salonId', description: 'Salon ID' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date YYYY-MM-DD (default: 30 days ago)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'End date YYYY-MM-DD (default: today)',
  })
  @ApiOkResponse({
    description: 'Aggregated salon metrics for the period',
    type: SalonAnalyticsResponseSwaggerDto,
  })
  @Get('analytics/salon/:salonId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async getSalonAnalytics(
    @Param('salonId') salonId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<SalonAnalyticsResponseDto> {
    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    return this.bookingService.getSalonAnalytics(
      salonId,
      from || defaultFrom.toISOString().split('T')[0],
      to || new Date().toISOString().split('T')[0],
    );
  }

  /** Internal — same analytics as GET analytics/salon/:salonId, for service-to-service (e.g. franchise overview). */
  @ApiExcludeEndpoint()
  @Get('internal/analytics/salon/:salonId')
  async getSalonAnalyticsInternal(
    @Param('salonId') salonId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Headers('x-internal-token') token: string | undefined,
  ): Promise<SalonAnalyticsResponseDto> {
    const expected = this.configService.get<string>('internalToken');
    if (!expected || token !== expected) {
      throw new UnauthorizedException('Internal access only');
    }
    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    return this.bookingService.getSalonAnalytics(
      salonId,
      from || defaultFrom.toISOString().split('T')[0],
      to || new Date().toISOString().split('T')[0],
    );
  }

  @ApiExcludeEndpoint()
  @Get('internal/salon/:salonId/active-bookings-count')
  async countActiveBookingsOnDateInternal(
    @Param('salonId') salonId: string,
    @Query('date') date: string | undefined,
    @Headers('x-internal-token') token: string | undefined,
  ): Promise<{ count: number }> {
    const expected = this.configService.get<string>('internalToken');
    if (!expected || token !== expected) {
      throw new UnauthorizedException('Internal access only');
    }
    const dateStr = date ?? new Date().toISOString().split('T')[0];
    const count = await this.bookingService.countActiveBookingsForSalonOnDate(salonId, dateStr);
    return { count };
  }

  /** Internal route — no auth guard, for service-to-service calls only (must be before @Get(':id')) */
  @ApiOperation({ summary: 'Get booking by ID (internal)' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking details' })
  @Get('internal/:id')
  async findOneInternal(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.findById(id);
  }

  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking details' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.findById(id);
  }

  @ApiOperation({ summary: 'Confirm a pending booking' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking confirmed' })
  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.STYLIST)
  async confirm(
    @Param('id') id: string,
  ): Promise<BookingResponseDto> {
    return this.bookingService.confirmBooking(id);
  }

  /** Internal route — called by calendar-service to persist the Google Calendar event ID */
  @ApiOperation({ summary: 'Set Google Calendar event ID (internal)' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking updated' })
  @Patch(':id/google-event')
  async setGoogleEventId(
    @Param('id') id: string,
    @Body() body: { googleEventId: string },
  ): Promise<BookingResponseDto> {
    return this.bookingService.setGoogleEventId(id, body.googleEventId);
  }

  /** Internal route — called by calendar-service to report sync outcome */
  @ApiOperation({ summary: 'Update calendar sync status (internal)' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking updated' })
  @Patch(':id/calendar-sync-status')
  async updateCalendarSyncStatus(
    @Param('id') id: string,
    @Body() body: { status: 'pending' | 'synced' | 'failed' },
  ): Promise<BookingResponseDto> {
    return this.bookingService.updateCalendarSyncStatus(id, body.status);
  }

  @ApiOperation({ summary: 'Mark booking as completed' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking completed' })
  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async complete(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.completeBooking(id);
  }

  @ApiOperation({ summary: 'Mark booking as no-show' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking marked no-show' })
  @Patch(':id/no-show')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER, UserRole.ADMIN)
  async markNoShow(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.markNoShow(id);
  }

  @ApiOperation({ summary: 'Assign booking to a station' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking updated' })
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

  // ── Waitlist ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Join the waitlist for a fully-booked time slot' })
  @ApiResponse({ status: 201, description: 'Waitlist entry created' })
  @Post('waitlist')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async joinWaitlist(
    @Body() dto: JoinWaitlistDto,
    @CurrentUser() user: JwtUser,
  ): Promise<WaitlistEntryResponseDto> {
    return this.bookingService.joinWaitlist(dto, user.sub);
  }

  @ApiOperation({ summary: 'Get my active waitlist entries' })
  @ApiResponse({ status: 200, description: 'Active waitlist entries for the current client' })
  @Get('waitlist/my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async getMyWaitlist(
    @CurrentUser() user: JwtUser,
  ): Promise<WaitlistEntryResponseDto[]> {
    return this.bookingService.getMyWaitlist(user.sub);
  }

  @ApiOperation({ summary: 'Leave (delete) a waitlist entry' })
  @ApiParam({ name: 'id', description: 'Waitlist entry ID' })
  @ApiResponse({ status: 200, description: 'Waitlist entry removed' })
  @Delete('waitlist/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async leaveWaitlist(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<{ success: boolean }> {
    return this.bookingService.leaveWaitlist(id, user.sub);
  }
}

import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Redirect,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';

import { GoogleOAuthService } from './google-oauth.service';
import { ICalService } from './ical.service';
import { JwtAuthGuard, CurrentUser, JwtUser } from '@org/shared-auth';
import { SubscriptionGuard, RequiresFeature } from '@org/subscription-check';
import {
  Booking,
  BookingDocument,
} from './schemas/booking-ref.schema';

@ApiTags('calendar')
@ApiBearerAuth('JWT')
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly oAuth: GoogleOAuthService,
    private readonly iCal: ICalService,
    @InjectModel(Booking.name, 'booking')
    private readonly bookingModel: Model<BookingDocument>,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Start Google Calendar OAuth (redirect)' })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  @Get('auth')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @RequiresFeature('google_calendar')
  @Redirect()
  initiateOAuth(@CurrentUser() user: JwtUser) {
    const url = this.oAuth.getAuthUrl();
    const urlWithState = new URL(url);
    urlWithState.searchParams.set('state', user.sub);
    return { url: urlWithState.toString() };
  }

  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: true, description: 'User id' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend' })
  @Get('auth/callback')
  async oAuthCallback(
    @Query('code') code: string,
    @Query('state') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !userId) {
      throw new UnauthorizedException('Missing OAuth code or state');
    }

    const googleEmail = await this.oAuth.handleCallback(code, userId);

    const frontendUrl = `${this.configService.get<string>('app.frontendUrl') ?? 'http://localhost:4200'}/settings/calendar?connected=true&email=${encodeURIComponent(googleEmail)}`;
    res.redirect(frontendUrl);
  }

  @ApiOperation({ summary: 'Disconnect Google Calendar' })
  @ApiResponse({ status: 200, description: 'Disconnected' })
  @Get('disconnect')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @RequiresFeature('google_calendar')
  async disconnect(
    @CurrentUser() user: JwtUser,
  ): Promise<{ message: string }> {
    await this.oAuth.disconnect(user.sub);
    return { message: 'Google Calendar disconnected successfully' };
  }

  @ApiOperation({ summary: 'Whether Google Calendar is connected' })
  @ApiResponse({ status: 200, description: 'Connection status' })
  @Get('status')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @RequiresFeature('google_calendar')
  async status(
    @CurrentUser() user: JwtUser,
  ): Promise<{ connected: boolean }> {
    const connected = await this.oAuth.isConnected(user.sub);
    return { connected };
  }

  @ApiOperation({ summary: 'Download .ics file for a booking' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Calendar file' })
  @Get('download/:bookingId')
  @UseGuards(JwtAuthGuard)
  async downloadIcs(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const booking = await this.bookingModel
        .findById(bookingId)
        .lean()
        .exec();

      if (!booking) {
        res.status(404).json({ message: `Booking ${bookingId} not found` });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = booking as any;

      let appointmentDateIso: string;
      try {
        appointmentDateIso = b.appointmentDate instanceof Date
          ? b.appointmentDate.toISOString()
          : new Date(b.appointmentDate as string).toISOString();
      } catch {
        appointmentDateIso = new Date().toISOString();
        Logger.warn(
          `Booking ${bookingId}: invalid appointmentDate "${b.appointmentDate}", using current date as fallback`,
          CalendarController.name,
        );
      }

      const services = Array.isArray(b.services)
        ? b.services.map((s: Record<string, unknown>) => ({
            serviceId: String(s['serviceId'] ?? s['_id'] ?? ''),
            name: String(s['name'] ?? 'Service'),
            price: Number(s['price'] ?? 0),
            durationMinutes: Number(s['durationMinutes'] ?? 30),
          }))
        : [];

      const { filename, content } = this.iCal.generateBookingIcs(
        {
          id: b._id.toString(),
          clientId: b.clientId?.toString() ?? '',
          salonId: b.salonId?.toString() ?? '',
          services,
          appointmentDate: appointmentDateIso,
          startTime: b.startTime ?? '09:00',
          endTime: b.endTime ?? '10:00',
          totalPrice: Number(b.totalPrice ?? 0),
          notes: b.notes ?? undefined,
          googleEventId: b.googleEventId ?? undefined,
        },
        {
          name: user.email,
          email: user.email,
          phone: '',
        },
        b.salonName ?? 'SnapSalon',
        b.salonAddress ?? '',
        this.configService.get<string>('app.emailFrom') ?? 'noreply@snapsalon.lk',
      );

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (err) {
      Logger.error(
        `Failed to generate .ics for booking ${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        CalendarController.name,
      );
      if (!res.headersSent) {
        res.status(500).json({
          statusCode: 500,
          message: 'Failed to generate calendar file',
        });
      }
    }
  }
}

import {
  Controller,
  Get,
  Param,
  Query,
  Redirect,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { GoogleOAuthService } from './google-oauth.service';
import { ICalService } from './ical.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import {
  Booking,
  BookingDocument,
} from './schemas/booking-ref.schema';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly oAuth: GoogleOAuthService,
    private readonly iCal: ICalService,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
  ) {}

  // ── Google OAuth ────────────────────────────────────────────────────────────

  /**
   * GET /calendar/auth
   * Redirects the authenticated user to Google's OAuth consent screen.
   */
  @Get('auth')
  @UseGuards(JwtAuthGuard)
  @Redirect()
  initiateOAuth(@CurrentUser() user: JwtUser) {
    const url = this.oAuth.getAuthUrl();
    // Embed userId in state so callback can identify who to persist tokens for
    const urlWithState = new URL(url);
    urlWithState.searchParams.set('state', user.sub);
    return { url: urlWithState.toString() };
  }

  /**
   * GET /calendar/auth/callback?code=...&state=...
   * Google redirects here after user grants consent.
   * The `state` parameter carries the SnapSalon userId.
   */
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

    // Redirect to the frontend with a success indicator
    const frontendUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:4200'}/settings/calendar?connected=true&email=${encodeURIComponent(googleEmail)}`;
    res.redirect(frontendUrl);
  }

  /**
   * GET /calendar/disconnect
   * Remove stored Google tokens for the authenticated user.
   */
  @Get('disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnect(
    @CurrentUser() user: JwtUser,
  ): Promise<{ message: string }> {
    await this.oAuth.disconnect(user.sub);
    return { message: 'Google Calendar disconnected successfully' };
  }

  /**
   * GET /calendar/status
   * Check whether the current user has Google Calendar connected.
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(
    @CurrentUser() user: JwtUser,
  ): Promise<{ connected: boolean }> {
    const connected = await this.oAuth.isConnected(user.sub);
    return { connected };
  }

  // ── iCal Download ───────────────────────────────────────────────────────────

  /**
   * GET /calendar/download/:bookingId
   * Returns a .ics file compatible with Apple Calendar and Outlook.
   * No OAuth required — works for any user.
   */
  @Get('download/:bookingId')
  @UseGuards(JwtAuthGuard)
  async downloadIcs(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ): Promise<void> {
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

    const { filename, content } = this.iCal.generateBookingIcs(
      {
        id: b._id.toString(),
        clientId: b.clientId.toString(),
        salonId: b.salonId.toString(),
        services: b.services ?? [],
        appointmentDate: b.appointmentDate.toISOString(),
        startTime: b.startTime,
        endTime: b.endTime,
        totalPrice: b.totalPrice,
        notes: b.notes ?? undefined,
        googleEventId: b.googleEventId ?? undefined,
      },
      {
        name: user.email,   // resolved name would come from auth-service in production
        email: user.email,
        phone: '',
      },
      b.salonName ?? 'SnapSalon',
      b.salonAddress ?? '',
      process.env['EMAIL_FROM'] ?? 'noreply@snapsalon.lk',
    );

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}

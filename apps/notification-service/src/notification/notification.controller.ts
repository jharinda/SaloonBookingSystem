import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { firstValueFrom } from 'rxjs';

import { BOOKING_QUEUE, NotificationEvent } from './constants/notification-events.constants';
import {
  BookingNotificationPayload,
  BookingPayload,
  RecipientInfo,
} from './interfaces/notification-payload.interface';

@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    @InjectQueue(BOOKING_QUEUE) private readonly bookingQueue: Queue,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // ── Endpoints (internal — no auth guard) ──────────────────────────────────

  @Post('booking-created')
  @HttpCode(HttpStatus.ACCEPTED)
  async bookingCreated(@Body() body: { booking: BookingPayload }) {
    return this.enqueueBookingEvent(NotificationEvent.BOOKING_CREATED, body.booking);
  }

  @Post('booking-confirmed')
  @HttpCode(HttpStatus.ACCEPTED)
  async bookingConfirmed(@Body() body: { booking: BookingPayload }) {
    return this.enqueueBookingEvent(NotificationEvent.BOOKING_CONFIRMED, body.booking);
  }

  @Post('booking-cancelled')
  @HttpCode(HttpStatus.ACCEPTED)
  async bookingCancelled(@Body() body: { booking: BookingPayload; reason?: string }) {
    return this.enqueueBookingEvent(NotificationEvent.BOOKING_CANCELLED, {
      ...body.booking,
      cancellationReason: body.reason ?? body.booking.cancellationReason,
    });
  }

  @Post('booking-completed')
  @HttpCode(HttpStatus.ACCEPTED)
  async bookingCompleted(@Body() body: { booking: BookingPayload }) {
    return this.enqueueBookingEvent(NotificationEvent.BOOKING_COMPLETED, body.booking);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async enqueueBookingEvent(
    event: NotificationEvent,
    booking: BookingPayload,
  ): Promise<{ queued: boolean }> {
    try {
      const [client, salonOwnerData] = await Promise.all([
        this.fetchClient(booking.clientId),
        this.fetchSalon(booking.salonId),
      ]);

      const payload: BookingNotificationPayload = {
        booking,
        client,
        salonOwner: salonOwnerData.owner,
        salonName: salonOwnerData.name,
        salonAddress: salonOwnerData.address,
      };

      await this.bookingQueue.add(event, payload);
      this.logger.log(`Queued ${event} for booking ${booking.id}`);
      return { queued: true };
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${event} for booking ${booking.id}: ${(error as Error).message}`,
      );
      return { queued: false };
    }
  }

  private async fetchClient(clientId: string): Promise<RecipientInfo> {
    try {
      const authUrl = this.configService.get<string>('services.authUrl');
      const { data } = await firstValueFrom(
        this.httpService.get(`${authUrl}/api/auth/users/${clientId}`),
      );
      return {
        name: data.name ?? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim(),
        email: data.email ?? '',
        phone: data.phone ?? '',
      };
    } catch (error) {
      this.logger.warn(`Could not fetch client ${clientId}: ${(error as Error).message}`);
      return { name: 'Unknown', email: '', phone: '' };
    }
  }

  private async fetchSalon(
    salonId: string,
  ): Promise<{ owner: RecipientInfo; name: string; address: string }> {
    try {
      const salonUrl = this.configService.get<string>('services.salonUrl');
      const { data } = await firstValueFrom(
        this.httpService.get(`${salonUrl}/api/salons/${salonId}`),
      );
      return {
        owner: {
          name: data.ownerName ?? data.owner?.name ?? 'Salon Owner',
          email: data.ownerEmail ?? data.owner?.email ?? '',
          phone: data.ownerPhone ?? data.owner?.phone ?? '',
        },
        name: data.name ?? '',
        address: data.address ?? '',
      };
    } catch (error) {
      this.logger.warn(`Could not fetch salon ${salonId}: ${(error as Error).message}`);
      return {
        owner: { name: 'Salon Owner', email: '', phone: '' },
        name: '',
        address: '',
      };
    }
  }
}

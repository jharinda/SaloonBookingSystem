import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Patch,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
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
import { SsePushService } from './providers/sse-push.service';
import { InboxNotificationService, PaginatedInboxDto } from './inbox-notification.service';

@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    @InjectQueue(BOOKING_QUEUE) private readonly bookingQueue: Queue,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly ssePush: SsePushService,
    private readonly inboxService: InboxNotificationService,
  ) {}

  // ── Endpoints (internal — no auth guard) ────────────────────────────────────────────

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

  /**
   * POST /notifications/review-posted
   * Called by review-service after a client submits a review.
   * Pushes a real-time SSE notification to the salon owner.
   */
  @Post('review-posted')
  @HttpCode(HttpStatus.ACCEPTED)
  async reviewPosted(
    @Body()
    body: {
      bookingId:   string;
      salonId:     string;
      clientName:  string;
      rating:      number;
      comment?:    string;
      serviceName?: string;
    },
  ): Promise<{ pushed: boolean }> {
    try {
      const salon = await this.fetchSalon(body.salonId);
      if (!salon.ownerId) {
        this.logger.warn(`review-posted: no ownerId resolved for salonId=${body.salonId}`);
        return { pushed: false };
      }

      await this.ssePush.push(salon.ownerId, NotificationEvent.REVIEW_POSTED, {
        bookingId:   body.bookingId,
        salonId:     body.salonId,
        clientName:  body.clientName,
        rating:      body.rating,
        comment:     body.comment,
        serviceName: body.serviceName,
        salonName:   salon.name,
      });

      return { pushed: true };
    } catch (err: unknown) {
      this.logger.error(
        `review-posted SSE push failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { pushed: false };
    }
  }

  /**
   * GET /notifications/inbox?page=1&limit=20
   *
   * Returns paginated persisted notifications for the requesting user.
   * The gateway JWT middleware stamps `x-user-id` on every authenticated request.
   *
   * Called by the Angular frontend to populate the notification inbox.
   */
  @Get('inbox')
  async getInbox(
    @Headers('x-user-id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedInboxDto> {
    if (!userId) {
      throw new UnauthorizedException('User ID missing from request headers');
    }

    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    return this.inboxService.findForUser(userId, pageNum, limitNum);
  }

  /**
   * GET /notifications/inbox/unread-count
   *
   * Returns the count of unread notifications for the requesting user.
   * Used to display the notification bell badge.
   */
  @Get('inbox/unread-count')
  async getUnreadCount(
    @Headers('x-user-id') userId: string,
  ): Promise<{ count: number }> {
    if (!userId) {
      throw new UnauthorizedException('User ID missing from request headers');
    }

    const count = await this.inboxService.getUnreadCount(userId);
    return { count };
  }

  /**
   * PATCH /notifications/inbox/:id/read
   *
   * Marks a single notification as read.
   */
  @Patch('inbox/:id/read')
  async markAsRead(
    @Headers('x-user-id') userId: string,
    @Param('id') notificationId: string,
  ): Promise<{ success: boolean }> {
    if (!userId) {
      throw new UnauthorizedException('User ID missing from request headers');
    }

    const success = await this.inboxService.markAsRead(userId, notificationId);
    return { success };
  }

  /**
   * PATCH /notifications/inbox/read-all
   *
   * Marks all notifications as read for the requesting user.
   */
  @Patch('inbox/read-all')
  async markAllAsRead(
    @Headers('x-user-id') userId: string,
  ): Promise<{ count: number }> {
    if (!userId) {
      throw new UnauthorizedException('User ID missing from request headers');
    }

    const count = await this.inboxService.markAllAsRead(userId);
    return { count };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────────

  private async enqueueBookingEvent(
    event: NotificationEvent,
    booking: BookingPayload,
  ): Promise<{ queued: boolean }> {
    try {
      const [client, salonData] = await Promise.all([
        this.fetchClient(booking.clientId),
        this.fetchSalon(booking.salonId),
      ]);

      const payload: BookingNotificationPayload = {
        booking,
        client,
        salonOwner:    salonData.owner,
        salonName:     salonData.name,
        salonAddress:  salonData.address,
        salonOwnerId:  salonData.ownerId,
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
      const internalToken = this.configService.get<string>('internalToken') ?? '';
      const { data } = await firstValueFrom(
        this.httpService.get(`${authUrl}/api/auth/users/${clientId}`, {
          headers: { 'x-internal-token': internalToken },
        }),
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
  ): Promise<{ owner: RecipientInfo; name: string; address: string; ownerId?: string }> {
    try {
      const salonUrl = this.configService.get<string>('services.salonUrl');
      const { data } = await firstValueFrom(
        this.httpService.get(`${salonUrl}/api/salons/${salonId}`),
      );
      return {
        owner: {
          name:  data.ownerName  ?? data.owner?.name  ?? 'Salon Owner',
          email: data.ownerEmail ?? data.owner?.email ?? '',
          phone: data.ownerPhone ?? data.owner?.phone ?? '',
        },
        name:    data.name    ?? '',
        address: data.address ?? '',
        ownerId: data.ownerId?.toString() ?? data.owner?._id?.toString(),
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

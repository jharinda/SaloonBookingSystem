import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import {
  NOTIFICATION_QUEUE,
  NotificationEvent,
} from '../constants/notification-events.constants';
import { SsePushService } from '../providers/sse-push.service';

export interface InvitationAcceptedPayload {
  stylistId: string;
  stylistName: string;
  salonId: string;
  salonName?: string;
  salonOwnerId?: string;
}

export interface SalonInvitationPayload {
  stylistId: string;
  salonId: string;
  salonName: string;
}

/**
 * Processes stylist invitation events from the notifications queue.
 * Sends SSE push notifications to the salon owner or stylist as appropriate.
 */
@Processor(NOTIFICATION_QUEUE)
export class InvitationNotificationProcessor {
  private readonly logger = new Logger(InvitationNotificationProcessor.name);

  constructor(private readonly ssePush: SsePushService) {}

  // ── stylist.invitation_accepted ─────────────────────────────────────────

  @Process(NotificationEvent.STYLIST_INVITATION_ACCEPTED)
  async handleInvitationAccepted(
    job: Job<InvitationAcceptedPayload>,
  ): Promise<void> {
    const { stylistId, stylistName, salonId, salonName, salonOwnerId } =
      job.data;

    this.logger.log(
      `Stylist ${stylistName} (${stylistId}) accepted invitation to salon ${salonId}`,
    );

    if (!salonOwnerId) {
      this.logger.warn(
        `No salonOwnerId for salon ${salonId} — skipping SSE push`,
      );
      return;
    }

    // Push real-time "staff.joined" notification to the salon owner
    await this.ssePush.push(salonOwnerId, 'staff.joined', {
      stylistId,
      staffName: stylistName,
      salonId,
      salonName,
    });

    this.logger.log(
      `Sent staff.joined notification to salon owner ${salonOwnerId}`,
    );
  }

  // ── stylist.salon_invitation (notify stylist of new invitation) ─────────

  @Process(NotificationEvent.STYLIST_SALON_INVITATION)
  async handleSalonInvitation(
    job: Job<SalonInvitationPayload>,
  ): Promise<void> {
    const { stylistId, salonId, salonName } = job.data;

    this.logger.log(
      `Sending salon invitation notification to stylist ${stylistId} from salon ${salonName}`,
    );

    await this.ssePush.push(stylistId, 'salon.invitation', {
      salonId,
      salonName,
      message: `You have been invited to join ${salonName}`,
    });
  }

  // ── Error handling ──────────────────────────────────────────────────────

  @OnQueueFailed()
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `[${job.name}] job #${job.id} failed after ${job.attemptsMade} attempt(s): ${err.message}`,
    );
  }
}

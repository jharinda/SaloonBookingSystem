import { Inject, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';

import {
  NOTIFICATION_QUEUE,
  NotificationEvent,
  TemplateType,
} from '../constants/notification-events.constants';
import {
  IPushNotificationService,
  PUSH_NOTIFICATION_SERVICE,
} from '../interfaces/notification-channel.interface';
import { NotificationDispatchService } from '../notification-dispatch.service';
import { TemplateVariables } from '../template.service';

/** Job name on {@link NOTIFICATION_QUEUE} — scheduled by {@link BookingLifecycleProcessor} */
export const REVIEW_NUDGE_JOB = 'review-nudge';

export interface ReviewNudgeJobPayload {
  bookingId: string;
  clientId: string;
  clientEmail: string;
  clientName: string;
  salonName: string;
  salonId: string;
}

/**
 * Fires ~2 hours after a booking is completed. Sends email + push (when FCM tokens exist).
 */
@Processor(NOTIFICATION_QUEUE)
export class ReviewNudgeProcessor {
  private readonly logger = new Logger(ReviewNudgeProcessor.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    @Inject(PUSH_NOTIFICATION_SERVICE)
    private readonly pushNotification: IPushNotificationService,
    private readonly config: ConfigService,
  ) {}

  @Process(REVIEW_NUDGE_JOB)
  async handleReviewNudge(job: Job<ReviewNudgeJobPayload>): Promise<void> {
    try {
      const { bookingId, clientId, clientEmail, clientName, salonName, salonId } = job.data;

      const frontendUrl = this.config.get<string>('frontendUrl', 'https://snapsalon.lk');
      const reviewUrl = `${frontendUrl}/reviews?bookingId=${bookingId}`;

      const vars: TemplateVariables = {
        clientName,
        salonName,
        reviewUrl,
      };

      await Promise.allSettled([
        this.dispatch.sendEmail(
          NotificationEvent.REVIEW_NUDGE,
          TemplateType.REVIEW_NUDGE,
          clientEmail,
          vars,
          bookingId,
          clientId,
        ),
        this.pushNotification.sendToUser(
          clientId,
          'How was your visit?',
          `We would love your feedback on ${salonName}. Tap to leave a short review.`,
          {
            bookingId,
            salonId,
            event: NotificationEvent.REVIEW_NUDGE,
            reviewUrl,
          },
        ),
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Review nudge failed (non-fatal) | job=${job.id} bookingId=${job.data?.bookingId}: ${message}`,
      );
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Job failed | queue=${NOTIFICATION_QUEUE} name=${job.name} id=${job.id}: ${error.message}`,
    );
  }
}

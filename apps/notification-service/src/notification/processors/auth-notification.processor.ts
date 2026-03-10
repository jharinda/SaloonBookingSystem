import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { NOTIFICATION_QUEUE, NotificationEvent } from '../constants/notification-events.constants';
import { EmailService } from '../providers/email.service';

export interface PasswordResetPayload {
  to: string;
  toName: string;
  subject: string;
  otp: string;
}

@Processor(NOTIFICATION_QUEUE)
export class AuthNotificationProcessor {
  private readonly logger = new Logger(AuthNotificationProcessor.name);

  constructor(private readonly email: EmailService) {}

  @Process(NotificationEvent.AUTH_PASSWORD_RESET)
  async handlePasswordReset(job: Job<PasswordResetPayload>): Promise<void> {
    const { to, toName, subject, otp } = job.data;

    this.logger.log(`Sending password reset OTP to ${to}`);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Password Reset Request</h2>
        <p>Hi ${toName},</p>
        <p>We received a request to reset your SnapSalon account password.
           Use the code below to complete your reset. It expires in <strong>15 minutes</strong>.</p>
        <div style="background:#f4f4f4;border-radius:8px;padding:24px;text-align:center;margin:24px 0">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2d6cdf">${otp}</span>
        </div>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
        <p style="color:#888;font-size:12px">— The SnapSalon Team</p>
      </div>
    `;

    await this.email.sendEmail({ to, toName, subject, html });
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `[${job.name}] job #${job.id} failed after ${job.attemptsMade} attempt(s): ${err.message}`,
    );
  }
}

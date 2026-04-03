import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';

import { NOTIFICATION_QUEUE, NotificationEvent } from '../constants/notification-events.constants';
import { EMAIL_SERVICE, IEmailService } from '../interfaces/notification-channel.interface';

export interface PasswordResetPayload {
  to: string;
  toName: string;
  subject: string;
  otp: string;
}

export interface EmailVerificationPayload {
  userId: string;
  email: string;
  token: string;
}

@Processor(NOTIFICATION_QUEUE)
export class AuthNotificationProcessor {
  private readonly logger = new Logger(AuthNotificationProcessor.name);

  constructor(
    @Inject(EMAIL_SERVICE) private readonly email: IEmailService,
    private readonly config: ConfigService,
  ) {}

  @Process(NotificationEvent.AUTH_PASSWORD_RESET)
  async handlePasswordReset(job: Job<PasswordResetPayload>): Promise<void> {
    const { to, toName, subject, otp } = job.data;

    this.logger.log(`Sending password reset OTP to ${to}`);

    const year = new Date().getFullYear();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
          <tr>
            <td style="background:#10B981;padding:24px 32px">
              <p style="margin:0;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:.5px">SnapSalon</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#333333;font-size:14px;line-height:1.7">
              <p style="margin:0 0 16px 0">Dear ${toName},</p>
              <p style="margin:0 0 16px 0">
                We received a request to reset the password associated with your SnapSalon account.
                Please use the verification code below to complete the process.
                This code is valid for <strong>15 minutes</strong>.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
                <tr>
                  <td align="center" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:28px">
                    <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase">Your Reset Code</p>
                    <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#059669">${otp}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px 0">
                If you did not request a password reset, please disregard this email.
                Your account remains secure and no changes have been made.
              </p>
              <p style="margin:0">
                Kind regards,<br>
                <strong>The SnapSalon Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eeeeee">
              <p style="margin:0;font-size:12px;color:#999999;text-align:center">
                You received this email because a password reset was requested for your SnapSalon account.
                &copy; ${year} SnapSalon. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.email.sendEmail({ to, toName, subject, html });
  }

  @Process('send-email-verification')
  async handleEmailVerification(job: Job<EmailVerificationPayload>): Promise<void> {
    const { email, token } = job.data;
    const frontendUrl = this.config.get<string>('frontendUrl', 'https://snapsalon.lk');
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

    this.logger.log(`Sending email verification to ${email}`);

    const year = new Date().getFullYear();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verify Your Email Address — SnapSalon</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
          <tr>
            <td style="background:#10B981;padding:24px 32px">
              <p style="margin:0;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:.5px">SnapSalon</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#333333;font-size:14px;line-height:1.7">
              <p style="margin:0 0 16px 0">Welcome to SnapSalon!</p>
              <p style="margin:0 0 16px 0">
                Thank you for creating your account. To complete your registration and activate all features,
                please verify your email address by clicking the button below.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}"
                       style="display:inline-block;background:#10B981;color:#ffffff;padding:14px 36px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;letter-spacing:.3px">
                      Verify My Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;color:#6b7280;font-size:13px">
                If the button above does not work, copy and paste the following link into your browser:
              </p>
              <p style="margin:0 0 24px 0;word-break:break-all;font-size:12px;color:#059669">${verifyUrl}</p>
              <p style="margin:0 0 16px 0;font-size:13px;color:#6b7280">
                This link will expire in <strong>24 hours</strong>. If you did not create a SnapSalon account,
                you can safely ignore this email.
              </p>
              <p style="margin:0">
                Kind regards,<br>
                <strong>The SnapSalon Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eeeeee">
              <p style="margin:0;font-size:12px;color:#999999;text-align:center">
                You received this email because an account was created using this address on SnapSalon.
                &copy; ${year} SnapSalon. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.email.sendEmail({
      to: email,
      toName: email,
      subject: 'Please Verify Your SnapSalon Email Address',
      html,
    });
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `[${job.name}] job #${job.id} failed after ${job.attemptsMade} attempt(s): ${err.message}`,
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SendEmailOptions {
  to: string;
  toName: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('SENDGRID_API_KEY');
    this.fromEmail = this.config.get<string>('EMAIL_FROM', 'noreply@snapsalon.lk');
    this.fromName = this.config.get<string>('EMAIL_FROM_NAME', 'SnapSalon');
  }

  async sendEmail(options: SendEmailOptions): Promise<string | null> {
    try {
      const response = await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        {
          personalizations: [
            {
              to: [{ email: options.to, name: options.toName }],
              subject: options.subject,
            },
          ],
          from: { email: this.fromEmail, name: this.fromName },
          content: [{ type: 'text/html', value: options.html }],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // SendGrid returns the message ID in the X-Message-Id header
      const messageId =
        (response.headers as Record<string, string>)['x-message-id'] ?? null;
      this.logger.log(`Email sent to ${options.to} | msgId=${messageId}`);
      return messageId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${options.to}: ${message}`);
      throw err;
    }
  }
}

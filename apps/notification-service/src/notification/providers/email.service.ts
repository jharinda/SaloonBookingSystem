import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

export interface SendEmailOptions {
  to: string;
  toName: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    this.fromEmail = this.config.get<string>('EMAIL_FROM', 'noreply@snapsalon.lk');
    this.fromName  = this.config.get<string>('EMAIL_FROM_NAME', 'SnapSalon');
  }

  onModuleInit(): void {
    const apiKey = this.config.getOrThrow<string>('SENDGRID_API_KEY');
    sgMail.setApiKey(apiKey);
    this.logger.log('SendGrid client initialised');
  }

  async sendEmail(options: SendEmailOptions): Promise<string | null> {
    const msg: sgMail.MailDataRequired = {
      to: { email: options.to, name: options.toName },
      from: { email: this.fromEmail, name: this.fromName },
      subject: options.subject,
      html: options.html,
    };

    try {
      const [response] = await sgMail.send(msg);
      // SendGrid returns the message ID in the X-Message-Id header
      const messageId =
        (response.headers as Record<string, string>)['x-message-id'] ?? null;
      this.logger.log(`Email sent to ${options.to} | msgId=${messageId}`);
      return messageId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${options.to}: ${message}`);
      throw err; // rethrow so Bull retries the job
    }
  }
}

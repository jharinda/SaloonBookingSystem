import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SendSmsOptions {
  to: string;   // E.164 format, e.g. +94771234567
  message: string;
}

/**
 * Dialog Axiata SMS Gateway
 * Docs: https://www.dialog.lk/business/enterprise/dialog-sms-gateway
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('DIALOG_SMS_API_KEY');
    this.senderId = this.config.get<string>('SMS_SENDER_ID', 'SnapSalon');
    this.baseUrl = this.config.get<string>(
      'DIALOG_SMS_BASE_URL',
      'https://e-sms.dialog.lk/api/v2',
    );
  }

  async sendSms(options: SendSmsOptions): Promise<string | null> {
    try {
      const response = await axios.post<{ message_id?: string }>(
        `${this.baseUrl}/send-sms`,
        {
          msisdn: options.to,
          message: options.message,
          source_address: this.senderId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const messageId = response.data?.message_id ?? null;
      this.logger.log(`SMS sent to ${options.to} | msgId=${messageId}`);
      return messageId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send SMS to ${options.to}: ${message}`);
      throw err;
    }
  }
}

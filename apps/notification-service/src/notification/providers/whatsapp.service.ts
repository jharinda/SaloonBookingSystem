import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SendWhatsAppOptions {
  to: string;      // E.164 format
  message: string;
}

/**
 * WhatsApp Business Cloud API
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiToken: string;
  private readonly phoneNumberId: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiToken = this.config.getOrThrow<string>('WHATSAPP_API_TOKEN');
    this.phoneNumberId = this.config.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.baseUrl = this.config.get<string>(
      'WHATSAPP_BASE_URL',
      'https://graph.facebook.com/v19.0',
    );
  }

  async sendMessage(options: SendWhatsAppOptions): Promise<string | null> {
    try {
      const response = await axios.post<{
        messages?: Array<{ id: string }>;
      }>(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: options.to,
          type: 'text',
          text: { preview_url: false, body: options.message },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const messageId = response.data?.messages?.[0]?.id ?? null;
      this.logger.log(`WhatsApp sent to ${options.to} | msgId=${messageId}`);
      return messageId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send WhatsApp to ${options.to}: ${message}`);
      throw err;
    }
  }
}

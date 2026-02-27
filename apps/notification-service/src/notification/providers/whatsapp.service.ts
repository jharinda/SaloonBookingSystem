import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SendWhatsAppOptions {
  to: string;      // E.164 format
  message: string; // Used as body param for text-based templates
}

/**
 * WhatsApp Business Cloud API — Template messages
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-based-message-templates
 *
 * Templates must be pre-approved in Meta Business Manager.
 * `WHATSAPP_TEMPLATE_NAME` defaults to 'snapsalon_notification'.
 * The first body component parameter receives the full message text so we
 * can keep a single generic template and vary only the body copy.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiToken: string;
  private readonly phoneNumberId: string;
  private readonly templateName: string;
  private readonly templateLang: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiToken      = this.config.getOrThrow<string>('WHATSAPP_API_TOKEN');
    this.phoneNumberId = this.config.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.templateName  = this.config.get<string>(
      'WHATSAPP_TEMPLATE_NAME',
      'snapsalon_notification',
    );
    this.templateLang  = this.config.get<string>('WHATSAPP_TEMPLATE_LANG', 'en_US');
    this.baseUrl = this.config.get<string>(
      'WHATSAPP_BASE_URL',
      'https://graph.facebook.com/v18.0',
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
          type: 'template',
          template: {
            name: this.templateName,
            language: { code: this.templateLang },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: options.message },
                ],
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const messageId = response.data?.messages?.[0]?.id ?? null;
      this.logger.log(`WhatsApp template sent to ${options.to} | msgId=${messageId}`);
      return messageId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send WhatsApp to ${options.to}: ${message}`);
      throw err; // rethrow so Bull retries the job
    }
  }
}

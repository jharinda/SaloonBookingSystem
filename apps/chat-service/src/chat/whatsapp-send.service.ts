import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { ChannelSendService } from './interfaces/channel-send.interface';

/**
 * WhatsappSendService handles sending messages to WhatsApp users
 * via the Meta WhatsApp Business API.
 */
@Injectable()
export class WhatsappSendService implements ChannelSendService {
  private readonly logger = new Logger(WhatsappSendService.name);
  private readonly whatsappPhoneNumberId: string;
  private readonly whatsappAccessToken: string;
  private readonly apiBaseUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.whatsappPhoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    this.whatsappAccessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN', '');

    if (!this.whatsappPhoneNumberId || !this.whatsappAccessToken) {
      this.logger.warn(
        'WhatsApp credentials not configured. WhatsApp messaging will not work.',
      );
    } else {
      this.logger.log('WhatsappSendService initialized');
    }
  }

  /**
   * Send a text message to a WhatsApp user.
   *
   * @param to - WhatsApp phone number (E.164 format, e.g., "14155552671")
   * @param body - Message text
   * @returns Promise<void>
   */
  async sendMessage(to: string, body: string): Promise<void> {
    if (!this.whatsappPhoneNumberId || !this.whatsappAccessToken) {
      throw new Error('WhatsApp credentials not configured');
    }

    try {
      const url = `${this.apiBaseUrl}/${this.whatsappPhoneNumberId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          body,
        },
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${this.whatsappAccessToken}`,
            'Content-Type': 'application/json',
          },
        })
      );

      this.logger.log(`WhatsApp message sent to ${to}: ${response.data.messages?.[0]?.id}`);
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message to ${to}: ${error.message}`);
      throw new Error(`WhatsApp send failed: ${error.message}`);
    }
  }

  /**
   * Send a media message to a WhatsApp user.
   *
   * @param to - WhatsApp phone number
   * @param mediaUrl - URL of the media file
   * @param caption - Optional caption for the media
   * @param mediaType - Type of media (image, video, document)
   */
  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType: 'image' | 'video' | 'document' = 'image',
  ): Promise<void> {
    if (!this.whatsappPhoneNumberId || !this.whatsappAccessToken) {
      throw new Error('WhatsApp credentials not configured');
    }

    try {
      const url = `${this.apiBaseUrl}/${this.whatsappPhoneNumberId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: mediaType,
        [mediaType]: {
          link: mediaUrl,
          ...(caption && { caption }),
        },
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${this.whatsappAccessToken}`,
            'Content-Type': 'application/json',
          },
        })
      );

      this.logger.log(`WhatsApp media message sent to ${to}: ${response.data.messages?.[0]?.id}`);
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp media message to ${to}: ${error.message}`);
      throw new Error(`WhatsApp media send failed: ${error.message}`);
    }
  }
}

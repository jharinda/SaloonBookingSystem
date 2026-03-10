import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * InstagramSendService handles sending messages to Instagram users
 * via the Meta Instagram Messaging API.
 */
@Injectable()
export class InstagramSendService {
  private readonly logger = new Logger(InstagramSendService.name);
  private readonly instagramPageAccessToken: string;
  private readonly apiBaseUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.instagramPageAccessToken = this.configService.get<string>('INSTAGRAM_PAGE_ACCESS_TOKEN', '');

    if (!this.instagramPageAccessToken) {
      this.logger.warn(
        'Instagram credentials not configured. Instagram messaging will not work.',
      );
    } else {
      this.logger.log('InstagramSendService initialized');
    }
  }

  /**
   * Send a text message to an Instagram user.
   *
   * @param recipientId - Instagram PSID (Page-Scoped ID)
   * @param body - Message text
   * @returns Promise<void>
   */
  async sendMessage(recipientId: string, body: string): Promise<void> {
    if (!this.instagramPageAccessToken) {
      throw new Error('Instagram credentials not configured');
    }

    try {
      const url = `${this.apiBaseUrl}/me/messages`;

      const payload = {
        recipient: {
          id: recipientId,
        },
        message: {
          text: body,
        },
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${this.instagramPageAccessToken}`,
            'Content-Type': 'application/json',
          },
        })
      );

      this.logger.log(`Instagram message sent to ${recipientId}: ${response.data.message_id}`);
    } catch (error) {
      this.logger.error(`Failed to send Instagram message to ${recipientId}: ${error.message}`);
      throw new Error(`Instagram send failed: ${error.message}`);
    }
  }

  /**
   * Send an image message to an Instagram user.
   *
   * @param recipientId - Instagram PSID
   * @param imageUrl - URL of the image
   * @returns Promise<void>
   */
  async sendImageMessage(recipientId: string, imageUrl: string): Promise<void> {
    if (!this.instagramPageAccessToken) {
      throw new Error('Instagram credentials not configured');
    }

    try {
      const url = `${this.apiBaseUrl}/me/messages`;

      const payload = {
        recipient: {
          id: recipientId,
        },
        message: {
          attachment: {
            type: 'image',
            payload: {
              url: imageUrl,
            },
          },
        },
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${this.instagramPageAccessToken}`,
            'Content-Type': 'application/json',
          },
        })
      );

      this.logger.log(`Instagram image sent to ${recipientId}: ${response.data.message_id}`);
    } catch (error) {
      this.logger.error(`Failed to send Instagram image to ${recipientId}: ${error.message}`);
      throw new Error(`Instagram image send failed: ${error.message}`);
    }
  }
}

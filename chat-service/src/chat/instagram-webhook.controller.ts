import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { InstagramSendService } from './instagram-send.service';
import { MessageChannel, SenderRole } from './schemas/message.schema';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface InstagramVerificationQuery {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

interface InstagramWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    messaging?: Array<{
      sender: {
        id: string;
      };
      recipient: {
        id: string;
      };
      timestamp: number;
      message?: {
        mid: string;
        text?: string;
        attachments?: Array<{
          type: string;
          payload: {
            url: string;
          };
        }>;
      };
    }>;
  }>;
}

/**
 * InstagramWebhookController handles incoming Instagram webhook events
 * from Meta's Instagram Messaging API.
 */
@Controller('chat/webhooks/instagram')
export class InstagramWebhookController {
  private readonly logger = new Logger(InstagramWebhookController.name);
  private readonly instagramVerifyToken: string;
  private readonly instagramPageToSalonId: Map<string, string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly instagramSendService: InstagramSendService,
    private readonly httpService: HttpService,
  ) {
    this.instagramVerifyToken = this.configService.get<string>('INSTAGRAM_VERIFY_TOKEN', '');

    // Parse INSTAGRAM_PAGE_TO_SALON_ID mapping from environment
    // Format: "pageId1:salonId1,pageId2:salonId2"
    const mapping = this.configService.get<string>('INSTAGRAM_PAGE_TO_SALON_ID', '');
    this.instagramPageToSalonId = new Map();

    if (mapping) {
      mapping.split(',').forEach((pair) => {
        const [pageId, salonId] = pair.split(':');
        if (pageId && salonId) {
          this.instagramPageToSalonId.set(pageId.trim(), salonId.trim());
        }
      });
    }

    this.logger.log('InstagramWebhookController initialized');
  }

  /**
   * GET /api/chat/webhooks/instagram
   * Meta webhook verification endpoint.
   *
   * @param query - Verification query parameters from Meta
   * @returns The challenge string if verification succeeds
   */
  @Get()
  verifyWebhook(@Query() query: InstagramVerificationQuery): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    this.logger.log(`Webhook verification request: mode=${mode}, token=${token ? '***' : 'empty'}`);

    if (mode === 'subscribe' && token === this.instagramVerifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }

    this.logger.warn('Webhook verification failed: invalid token or mode');
    throw new BadRequestException('Verification failed');
  }

  /**
   * POST /api/chat/webhooks/instagram
   * Receive incoming Instagram messages.
   *
   * @param payload - Instagram webhook payload from Meta
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: InstagramWebhookPayload): Promise<{ status: string }> {
    this.logger.log(`Received webhook: ${JSON.stringify(payload)}`);

    // Meta expects a 200 OK response immediately
    // Process the webhook asynchronously
    this.processWebhook(payload).catch((error) => {
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
    });

    return { status: 'ok' };
  }

  /**
   * Process the Instagram webhook payload asynchronously.
   */
  private async processWebhook(payload: InstagramWebhookPayload): Promise<void> {
    if (payload.object !== 'instagram') {
      this.logger.warn(`Ignoring webhook object type: ${payload.object}`);
      return;
    }

    for (const entry of payload.entry) {
      if (entry.messaging) {
        for (const messagingEvent of entry.messaging) {
          await this.handleMessagingEvent(messagingEvent, entry.id);
        }
      }
    }
  }

  /**
   * Handle incoming Instagram message event.
   */
  private async handleMessagingEvent(
    event: InstagramWebhookPayload['entry'][0]['messaging'][0],
    pageId: string,
  ): Promise<void> {
    // Only process messages (not delivery receipts or read receipts)
    if (!event.message || !event.message.text) {
      this.logger.log(`Ignoring non-text message event`);
      return;
    }

    const senderId = event.sender.id; // Instagram PSID
    const messageText = event.message.text;
    const messageId = event.message.mid;

    // Find which salon this Instagram page belongs to
    const salonId = this.instagramPageToSalonId.get(pageId);
    if (!salonId) {
      this.logger.warn(`No salon mapping found for Instagram page: ${pageId}`);
      return;
    }

    try {
      // Find or create conversation
      const conversation = await this.chatService.findOrCreateInstagramConversation(
        salonId,
        senderId,
        senderId, // Use PSID as sender name initially
      );

      // Save the message
      const savedMessage = await this.chatService.createMessage(
        conversation._id.toString(),
        senderId, // Use Instagram PSID as senderId for external users
        senderId, // Sender name (could be enhanced with profile lookup)
        SenderRole.CLIENT,
        messageText,
        MessageChannel.INSTAGRAM,
        null,
      );

      this.logger.log(
        `Instagram message saved: conversation=${conversation._id}, mid=${messageId}`,
      );

      // Emit real-time notification to salon owner's room
      this.chatGateway.emitToSalonOwner(salonId, 'new_message', {
        message: savedMessage.toObject(),
        conversationId: conversation._id.toString(),
      });

      // Send FCM push notification to salon owner
      await this.sendPushToSalonOwner(salonId, senderId, messageText, conversation._id.toString());

      this.logger.log(`Notifications sent for Instagram message from ${senderId}`);

      // CHATBOT AUTOMATION HOOK
      // TODO: Publish to Bull queue for AI chatbot processing
      // await this.queueService.add('chatbot-trigger', {
      //   conversationId: conversation._id.toString(),
      //   channel: 'instagram',
      //   message: messageText,
      //   salonId,
      // });
    } catch (error) {
      this.logger.error(
        `Failed to process Instagram message from ${senderId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send FCM push notification to salon owner.
   */
  private async sendPushToSalonOwner(
    salonId: string,
    senderName: string,
    messageBody: string,
    conversationId: string,
  ): Promise<void> {
    try {
      // Get notification service URL
      const notificationServiceUrl = this.configService.get<string>(
        'NOTIFICATION_SERVICE_URL',
        'http://localhost:3004'
      );

      // For now, we'll use salonId as the recipient
      // In a real implementation, you'd fetch the salon owner's user ID
      await firstValueFrom(
        this.httpService.post(`${notificationServiceUrl}/api/notifications/push`, {
          userId: salonId, // This should be the salon owner's user ID
          title: `New Instagram message from ${senderName}`,
          body: messageBody.length > 100 ? `${messageBody.substring(0, 100)}...` : messageBody,
          data: {
            type: 'instagram_message',
            conversationId,
            senderId: salonId,
          },
        })
      );

      this.logger.log(`Push notification sent to salon owner for salon ${salonId}`);
    } catch (error) {
      // Non-critical error, just log it
      this.logger.warn(`Failed to send push notification: ${error.message}`);
    }
  }
}

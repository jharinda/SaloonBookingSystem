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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { WhatsappSendService } from './whatsapp-send.service';
import { MessageChannel, SenderRole } from './schemas/message.schema';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface WhatsAppVerificationQuery {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          type: string;
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

/**
 * WhatsappWebhookController handles incoming WhatsApp webhook events
 * from Meta's WhatsApp Business API.
 */
@ApiTags('chat')
@Controller('chat/webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);
  private readonly whatsappVerifyToken: string;
  private readonly whatsappPhoneToSalonId: Map<string, string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly whatsappSendService: WhatsappSendService,
    private readonly httpService: HttpService,
  ) {
    this.whatsappVerifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN', '');

    // Parse WHATSAPP_PHONE_TO_SALON_ID mapping from environment
    // Format: "phone1:salonId1,phone2:salonId2"
    const mapping = this.configService.get<string>('WHATSAPP_PHONE_TO_SALON_ID', '');
    this.whatsappPhoneToSalonId = new Map();

    if (mapping) {
      mapping.split(',').forEach((pair) => {
        const [phone, salonId] = pair.split(':');
        if (phone && salonId) {
          this.whatsappPhoneToSalonId.set(phone.trim(), salonId.trim());
        }
      });
    }

    this.logger.log('WhatsappWebhookController initialized');
  }

  /**
   * GET /api/chat/webhooks/whatsapp
   * Meta webhook verification endpoint.
   *
   * @param query - Verification query parameters from Meta
   * @returns The challenge string if verification succeeds
   */
  @ApiOperation({ summary: 'Meta WhatsApp webhook verification (GET)' })
  @ApiResponse({ status: 200, description: 'Challenge string' })
  @Get()
  verifyWebhook(@Query() query: WhatsAppVerificationQuery): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    this.logger.log(`Webhook verification request: mode=${mode}, token=${token ? '***' : 'empty'}`);

    if (mode === 'subscribe' && token === this.whatsappVerifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }

    this.logger.warn('Webhook verification failed: invalid token or mode');
    throw new BadRequestException('Verification failed');
  }

  /**
   * POST /api/chat/webhooks/whatsapp
   * Receive incoming WhatsApp messages.
   *
   * @param payload - WhatsApp webhook payload from Meta
   */
  @ApiOperation({ summary: 'Meta WhatsApp incoming messages (POST)' })
  @ApiResponse({ status: 200, description: 'Ack' })
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: WhatsAppWebhookPayload): Promise<{ status: string }> {
    this.logger.log(`Received webhook: ${JSON.stringify(payload)}`);

    // Meta expects a 200 OK response immediately
    // Process the webhook asynchronously
    this.processWebhook(payload).catch((error) => {
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
    });

    return { status: 'ok' };
  }

  /**
   * Process the WhatsApp webhook payload asynchronously.
   */
  private async processWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
    if (payload.object !== 'whatsapp_business_account') {
      this.logger.warn(`Ignoring webhook object type: ${payload.object}`);
      return;
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          await this.handleMessageChange(change.value);
        }
      }
    }
  }

  /**
   * Handle incoming WhatsApp message.
   */
  private async handleMessageChange(value: WhatsAppWebhookPayload['entry'][0]['changes'][0]['value']): Promise<void> {
    const messages = value.messages;
    const contacts = value.contacts;

    if (!messages || messages.length === 0) {
      // This might be a status update, not a new message
      return;
    }

    const metadata = value.metadata;
    const receivingPhoneNumber = metadata.display_phone_number;

    // Find which salon this WhatsApp number belongs to
    const salonId = this.whatsappPhoneToSalonId.get(receivingPhoneNumber);
    if (!salonId) {
      this.logger.warn(`No salon mapping found for WhatsApp number: ${receivingPhoneNumber}`);
      return;
    }

    for (const message of messages) {
      // Only process text messages for now
      if (message.type !== 'text' || !message.text) {
        this.logger.log(`Ignoring non-text message type: ${message.type}`);
        continue;
      }

      const from = message.from; // WhatsApp ID (phone number)
      const body = message.text.body;
      const wamid = message.id; // WhatsApp message ID

      // Get sender's name from contacts
      const senderName = contacts?.find((c) => c.wa_id === from)?.profile.name || from;

      try {
        // Find or create conversation
        const conversation = await this.chatService.findOrCreateWhatsAppConversation(
          salonId,
          from,
          senderName,
        );

        // Save the message
        const savedMessage = await this.chatService.createMessage(
          conversation._id.toString(),
          from, // Use WhatsApp ID as senderId for external users
          senderName,
          SenderRole.CLIENT,
          body,
          MessageChannel.WHATSAPP,
          null,
        );

        this.logger.log(
          `WhatsApp message saved: conversation=${conversation._id}, wamid=${wamid}`,
        );

        // Emit real-time notification to salon owner's room
        // The salon owner's room is identified by salonId
        this.chatGateway.emitToSalonOwner(salonId, 'new_message', {
          message: savedMessage.toObject(),
          conversationId: conversation._id.toString(),
        });

        // Send FCM push notification to salon owner
        await this.sendPushToSalonOwner(salonId, senderName, body, conversation._id.toString());

        this.logger.log(`Notifications sent for WhatsApp message from ${senderName}`);
      } catch (error) {
        this.logger.error(
          `Failed to process WhatsApp message from ${from}: ${error.message}`,
          error.stack,
        );
      }
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
          title: `New WhatsApp message from ${senderName}`,
          body: messageBody.length > 100 ? `${messageBody.substring(0, 100)}...` : messageBody,
          data: {
            type: 'whatsapp_message',
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

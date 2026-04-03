import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';

import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappSendService } from './whatsapp-send.service';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { InstagramSendService } from './instagram-send.service';
import { SharedAuthModule } from '@org/shared-auth';
import {
  WHATSAPP_SEND_SERVICE,
  INSTAGRAM_SEND_SERVICE,
} from './interfaces/channel-send.interface';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    HttpModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [ChatController, WhatsappWebhookController, InstagramWebhookController],
  providers: [
    ChatService,
    ChatGateway,
    WhatsappSendService,
    InstagramSendService,
    // DIP: abstract token → concrete implementation (swap with one line)
    { provide: WHATSAPP_SEND_SERVICE, useExisting: WhatsappSendService },
    { provide: INSTAGRAM_SEND_SERVICE, useExisting: InstagramSendService },
  ],
  exports: [ChatService],
})
export class ChatModule {}

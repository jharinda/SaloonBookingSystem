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
    // Provide WhatsappSendService with a string token for forwardRef in ChatService
    {
      provide: 'WhatsappSendService',
      useExisting: WhatsappSendService,
    },
    // Provide InstagramSendService with a string token for forwardRef in ChatService
    {
      provide: 'InstagramSendService',
      useExisting: InstagramSendService,
    },
  ],
  exports: [ChatService],
})
export class ChatModule {}

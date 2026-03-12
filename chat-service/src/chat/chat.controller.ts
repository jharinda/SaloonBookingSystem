import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  CurrentUser,
  JwtUser,
} from '@org/shared-auth';

import { ChatService, ConversationWithUnread, PaginatedMessages } from './chat.service';
import { Conversation } from './schemas/conversation.schema';
import { CreateConversationDto, GetMessagesQueryDto } from './dto/chat.dto';

/**
 * ChatController handles HTTP requests for messaging functionality.
 */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /api/chat/conversations
   * Find or create a conversation between the current user and a salon.
   */
  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  async createConversation(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateConversationDto,
  ): Promise<Conversation> {
    this.logger.log(`Creating/finding conversation: client=${user.email}, salon=${dto.salonId}`);
    return this.chatService.findOrCreateConversation(user.sub, dto.salonId, user.email);
  }

  /**
   * GET /api/chat/conversations
   * Get all conversations for the current user.
   * For salon owners, returns conversations for their salon.
   * For clients, returns their conversations.
   */
  @Get('conversations')
  async getConversations(
    @CurrentUser() user: JwtUser,
  ): Promise<ConversationWithUnread[]> {
    this.logger.log(`Fetching conversations for user ${user.email}, role: ${user.role}`);

    // For salon owners, their user ID IS the salonId in conversations
    // For clients, we don't pass a salonId
    const salonId = user.role === 'salon_owner' ? user.sub : undefined;

    return this.chatService.getUserConversations(user.sub, user.role, salonId);
  }

  /**
   * GET /api/chat/conversations/:id/messages
   * Get paginated messages for a conversation.
   * Marks messages as read upon retrieval.
   */
  @Get('conversations/:id/messages')
  async getMessages(
    @CurrentUser() user: JwtUser,
    @Param('id') conversationId: string,
    @Query() query: GetMessagesQueryDto,
  ): Promise<PaginatedMessages> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '50', 10);

    this.logger.log(
      `Fetching messages: conversation=${conversationId}, user=${user.email}, page=${page}, limit=${limit}`
    );

    return this.chatService.getConversationMessages(
      conversationId,
      user.sub,
      page,
      limit,
    );
  }

  /**
   * DELETE /api/chat/messages/:id
   * Soft delete a message (only sender can delete).
   */
  @Delete('messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(
    @CurrentUser() user: JwtUser,
    @Param('id') messageId: string,
  ): Promise<void> {
    this.logger.log(`Deleting message ${messageId} by user ${user.email}`);
    await this.chatService.deleteMessage(messageId, user.sub, user.email);
  }
}

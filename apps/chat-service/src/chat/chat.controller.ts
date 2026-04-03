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
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  JwtUser,
} from '@org/shared-auth';

import { ChatService, ConversationWithUnread, PaginatedMessages } from './chat.service';
import { Conversation } from './schemas/conversation.schema';
import { CreateConversationDto, GetMessagesQueryDto } from './dto/chat.dto';

@ApiTags('chat')
@ApiBearerAuth('JWT')
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @ApiOperation({ summary: 'Find or create conversation with a salon' })
  @ApiResponse({ status: 200, description: 'Conversation' })
  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  async createConversation(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateConversationDto,
  ): Promise<Conversation> {
    this.logger.log(`Creating/finding conversation: client=${user.email}, salon=${dto.salonId}`);
    return this.chatService.findOrCreateConversation(user.sub, dto.salonId, user.email);
  }

  @ApiOperation({ summary: 'List conversations for current user' })
  @ApiResponse({ status: 200, description: 'Conversations with unread counts' })
  @Get('conversations')
  async getConversations(
    @CurrentUser() user: JwtUser,
  ): Promise<ConversationWithUnread[]> {
    this.logger.log(`Fetching conversations for user ${user.email}, role: ${user.role}`);

    const salonId = user.role === 'salon_owner' ? user.sub : undefined;

    return this.chatService.getUserConversations(user.sub, user.role, salonId);
  }

  @ApiOperation({ summary: 'Paginated messages for a conversation' })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Messages page' })
  @Get('conversations/:id/messages')
  async getMessages(
    @CurrentUser() user: JwtUser,
    @Param('id') conversationId: string,
    @Query() query: GetMessagesQueryDto,
  ): Promise<PaginatedMessages> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '50', 10);

    this.logger.log(
      `Fetching messages: conversation=${conversationId}, user=${user.email}, page=${page}, limit=${limit}`,
    );

    return this.chatService.getConversationMessages(
      conversationId,
      user.sub,
      page,
      limit,
    );
  }

  @ApiOperation({ summary: 'Soft-delete own message' })
  @ApiParam({ name: 'id', description: 'Message id' })
  @ApiResponse({ status: 204, description: 'Deleted' })
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

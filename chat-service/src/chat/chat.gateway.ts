import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { ChatService } from './chat.service';

/**
 * Extended Socket interface with authenticated user properties.
 */
interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

interface JoinConversationDto {
  conversationId: string;
}

interface SendMessageDto {
  conversationId: string;
  body: string;
  mediaUrl?: string;
}

interface MarkReadDto {
  conversationId: string;
}

interface TypingDto {
  conversationId: string;
}

/**
 * ChatGateway handles real-time messaging via WebSocket (Socket.io).
 * Clients connect to the /chat namespace and authenticate via JWT.
 */
@WebSocketGateway({
  cors: true,
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Handle new WebSocket connections.
   * Validates JWT token from socket.handshake.auth.token.
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = client.handshake.auth.token;

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const jwtSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
      const payload = this.jwtService.verify(token, { secret: jwtSecret });

      // Store user info in socket
      client.userId = payload.sub;
      client.userEmail = payload.email;
      client.userRole = payload.role;

      this.logger.log(`Client connected: ${client.id} (user: ${client.userId})`);
    } catch (error) {
      this.logger.error(`Connection authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection.
   */
  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(`Client disconnected: ${client.id} (user: ${client.userId})`);
  }

  /**
   * Join a conversation room.
   * Client sends: { conversationId }
   */
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinConversationDto,
  ): Promise<void> {
    try {
      const { conversationId } = data;

      if (!client.userId) {
        throw new WsException('Unauthorized');
      }

      // Verify user is a participant
      const isParticipant = await this.chatService.isParticipant(conversationId, client.userId);
      if (!isParticipant) {
        throw new WsException('You are not a participant in this conversation');
      }

      // Join the room
      client.join(conversationId);
      this.logger.log(`User ${client.userId} joined conversation ${conversationId}`);
    } catch (error) {
      this.logger.error(`Error joining conversation: ${error.message}`);
      throw new WsException(error.message);
    }
  }

  /**
   * Send a message in a conversation.
   * Client sends: { conversationId, body, mediaUrl? }
   *
   * - Saves message to MongoDB
   * - Updates conversation.lastMessage
   * - Emits "new_message" to all clients in the room
   * - Sends push notification to the other participant
   */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendMessageDto,
  ): Promise<void> {
    try {
      const { conversationId, body, mediaUrl } = data;

      if (!client.userId || !client.userEmail || !client.userRole) {
        throw new WsException('Unauthorized');
      }

      // Determine sender name (could be enhanced with a user service lookup)
      const senderName = client.userEmail.split('@')[0]; // Simplified

      // Save message to database and send via appropriate channel (internal or WhatsApp)
      const message = await this.chatService.sendMessage(
        conversationId,
        client.userId,
        senderName,
        client.userRole,
        body,
        mediaUrl,
      );

      // Emit new message to all clients in the conversation room
      this.server.to(conversationId).emit('new_message', {
        message: message.toObject(),
      });

      this.logger.log(`Message sent in conversation ${conversationId} by user ${client.userId}`);

      // Send push notification to the other participant (best-effort, non-blocking)
      this.sendPushNotification(conversationId, client.userId, senderName, body).catch((err) => {
        this.logger.warn(`Failed to send push notification: ${err.message}`);
      });
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`);
      throw new WsException(error.message);
    }
  }

  /**
   * Mark messages as read in a conversation.
   * Client sends: { conversationId }
   *
   * - Updates read status in database
   * - Emits "messages_read" to all clients in the room
   */
  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: MarkReadDto,
  ): Promise<void> {
    try {
      const { conversationId } = data;

      if (!client.userId) {
        throw new WsException('Unauthorized');
      }

      // Update read status
      const readAt = await this.chatService.updateReadStatus(conversationId, client.userId);

      // Emit read receipt to all clients in the room
      this.server.to(conversationId).emit('messages_read', {
        conversationId,
        userId: client.userId,
        readAt,
      });

      this.logger.log(`Messages marked as read in conversation ${conversationId} by user ${client.userId}`);
    } catch (error) {
      this.logger.error(`Error marking messages as read: ${error.message}`);
      throw new WsException(error.message);
    }
  }

  /**
   * Handle typing indicator.
   * Client sends: { conversationId }
   *
   * - Relays to all other clients in the room as "user_typing"
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: TypingDto,
  ): Promise<void> {
    try {
      const { conversationId } = data;

      if (!client.userId) {
        throw new WsException('Unauthorized');
      }

      // Relay typing event to others in the room (excluding sender)
      client.to(conversationId).emit('user_typing', {
        userId: client.userId,
        conversationId,
      });
    } catch (error) {
      this.logger.error(`Error handling typing event: ${error.message}`);
    }
  }

  /**
   * Emit an event to the salon owner's room.
   * This is used when receiving WhatsApp messages to notify the salon owner in real-time.
   *
   * @param salonId - The salon's MongoDB ObjectId
   * @param event - The event name to emit
   * @param data - The event payload
   */
  emitToSalonOwner(salonId: string, event: string, data: unknown): void {
    // Emit to a room identified by salon ID
    // Salon owners should join this room when they connect
    const roomName = `salon:${salonId}`;
    this.server.to(roomName).emit(event, data);
    this.logger.log(`Event ${event} emitted to salon ${salonId}`);
  }

  /**
   * Send push notification to the other participant via notification-service.
   * This is a best-effort HTTP call for immediate delivery.
   */
  private async sendPushNotification(
    conversationId: string,
    senderId: string,
    senderName: string,
    messageBody: string,
  ): Promise<void> {
    try {
      // Get the other participant
      const recipientId = await this.chatService.getOtherParticipant(conversationId, senderId);
      if (!recipientId) {
        this.logger.warn(`No other participant found for conversation ${conversationId}`);
        return;
      }

      // Get notification service URL
      const notificationServiceUrl = this.configService.get<string>(
        'NOTIFICATION_SERVICE_URL',
        'http://localhost:3004'
      );

      // Call notification-service to send push notification
      // This endpoint should exist in notification-service for sending FCM notifications
      await firstValueFrom(
        this.httpService.post(`${notificationServiceUrl}/api/notifications/push`, {
          userId: recipientId,
          title: `New message from ${senderName}`,
          body: messageBody.length > 100 ? `${messageBody.substring(0, 100)}...` : messageBody,
          data: {
            type: 'new_message',
            conversationId,
            senderId,
          },
        })
      );

      this.logger.log(`Push notification sent to user ${recipientId}`);
    } catch (error) {
      // Log error but don't throw - push notifications are best-effort
      this.logger.warn(`Failed to send push notification: ${error.message}`);
    }
  }
}

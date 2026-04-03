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

      // Join user to their personal room for direct messaging
      client.join(`user:${client.userId}`);
      this.logger.log(`✅ User ${client.userEmail} joined personal room: user:${client.userId}`);

      this.logger.log(`Client connected: ${client.id} (user: ${client.userEmail})`);
    } catch (error) {
      this.logger.error(`Connection authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection.
   */
  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(`Client disconnected: ${client.id} (user: ${client.userEmail})`);
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
      this.logger.log(`User ${client.userEmail} joined conversation ${conversationId}`);
    } catch (error) {
      this.logger.error(`Error joining conversation: ${error.message}`);
      throw new WsException(error.message);
    }
  }

  /**
   * Join a salon room (for salon owners).
   * Client sends: { salonId }
   */
  @SubscribeMessage('join_salon_room')
  async handleJoinSalonRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { salonId: string },
  ): Promise<void> {
    try {
      const { salonId } = data;

      if (!client.userId) {
        throw new WsException('Unauthorized');
      }

      // Verify that the client's userId matches the salonId
      if (client.userId !== salonId) {
        throw new WsException('Salon owner must match salon');
      }

      // Join the salon room
      client.join(`salon:${salonId}`);
      this.logger.log(`Salon owner ${client.userEmail} joined room salon:${salonId}`);
    } catch (error) {
      this.logger.error(`Error joining salon room: ${error.message}`);
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
      const messageObj = message.toObject();
      this.logger.log(`📤 Emitting new_message to conversation ${conversationId}. Message:`, JSON.stringify({
        senderId: messageObj.senderId,
        senderName: messageObj.senderName,
        body: messageObj.body,
        conversationId: messageObj.conversationId
      }));

      this.server.to(conversationId).emit('new_message', {
        message: messageObj,
      });

      // Emit to each participant's personal room to ensure they get notifications
      // even if they haven't joined the conversation room yet
      const conversation = await this.chatService.getConversationById(conversationId);
      if (conversation?.participants) {
        for (const participantId of conversation.participants) {
          const participantIdStr = participantId.toString();
          // Don't re-emit to sender
          if (participantIdStr !== client.userId) {
            this.logger.log(`📤 Emitting to participant user room: user:${participantIdStr}`);
            this.server.to(`user:${participantIdStr}`).emit('new_message', {
              message: messageObj,
            });
          }
        }
      }

      // Also emit to the salon room so salon owners can see messages (legacy support)
      if (conversation?.salonId) {
        this.logger.log(`📤 Also emitting to salon room: salon:${conversation.salonId.toString()}`);
        this.server.to(`salon:${conversation.salonId.toString()}`).emit('new_message', {
          message: messageObj,
        });
      }

      this.logger.log(`Message sent in conversation ${conversationId} by ${client.userEmail}`);

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

      this.logger.log(`Messages marked as read in conversation ${conversationId} by ${client.userEmail}`);
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

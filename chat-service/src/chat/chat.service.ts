import { Injectable, Logger, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Conversation, ConversationDocument, ConversationChannel } from './schemas/conversation.schema';
import { Message, MessageDocument, DeliveryStatus, MessageChannel } from './schemas/message.schema';

export interface ConversationWithUnread extends Conversation {
  unreadCount: number;
}

export interface PaginatedMessages {
  messages: Message[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * ChatService handles all messaging functionality including conversations
 * and messages across internal chat, WhatsApp, and Instagram channels.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @Inject(forwardRef(() => 'WhatsappSendService'))
    private readonly whatsappSendService?: {
      sendMessage: (to: string, body: string) => Promise<void>;
      sendMediaMessage: (to: string, mediaUrl: string, caption?: string) => Promise<void>;
    },
    @Inject(forwardRef(() => 'InstagramSendService'))
    private readonly instagramSendService?: {
      sendMessage: (recipientId: string, body: string) => Promise<void>;
      sendImageMessage: (recipientId: string, imageUrl: string) => Promise<void>;
    },
  ) {
    this.logger.log('ChatService initialized');
  }

  /**
   * Find or create a conversation between a client and a salon.
   * Ensures only one conversation exists per client-salon pair.
   */
  async findOrCreateConversation(
    clientId: string,
    salonId: string,
  ): Promise<Conversation> {
    const clientObjectId = new Types.ObjectId(clientId);
    const salonObjectId = new Types.ObjectId(salonId);

    // Try to find existing conversation
    let conversation = await this.conversationModel.findOne({
      clientId: clientObjectId,
      salonId: salonObjectId,
    }).exec();

    // Create new conversation if it doesn't exist
    if (!conversation) {
      this.logger.log(`Creating new conversation: client=${clientId}, salon=${salonId}`);
      conversation = await this.conversationModel.create({
        participants: [clientObjectId, salonObjectId],
        clientId: clientObjectId,
        salonId: salonObjectId,
        channel: ConversationChannel.INTERNAL,
        externalThreadId: null,
        lastMessage: null,
        lastReadAt: [],
        isArchived: false,
      });
    }

    return conversation;
  }

  /**
   * Find or create a WhatsApp conversation between a client and a salon.
   * This is used when receiving WhatsApp messages from external users.
   *
   * @param salonId - The salon's MongoDB ObjectId
   * @param externalThreadId - WhatsApp phone number of the client
   * @param clientName - Name of the WhatsApp user
   * @returns The conversation document
   */
  async findOrCreateWhatsAppConversation(
    salonId: string,
    externalThreadId: string,
    clientName: string,
  ): Promise<Conversation> {
    const salonObjectId = new Types.ObjectId(salonId);

    // Try to find existing WhatsApp conversation
    let conversation = await this.conversationModel.findOne({
      salonId: salonObjectId,
      channel: ConversationChannel.WHATSAPP,
      externalThreadId,
    }).exec();

    // Create new conversation if it doesn't exist
    if (!conversation) {
      this.logger.log(
        `Creating new WhatsApp conversation: salon=${salonId}, phone=${externalThreadId}, client=${clientName}`,
      );

      // For WhatsApp conversations, we create a placeholder client ID
      // In production, you might want to create a proper user record
      const placeholderClientId = new Types.ObjectId();

      conversation = await this.conversationModel.create({
        participants: [placeholderClientId, salonObjectId],
        clientId: placeholderClientId,
        salonId: salonObjectId,
        channel: ConversationChannel.WHATSAPP,
        externalThreadId,
        lastMessage: null,
        lastReadAt: [],
        isArchived: false,
      });
    }

    return conversation;
  }

  /**
   * Find or create an Instagram conversation between a client and a salon.
   * This is used when receiving Instagram DMs from external users.
   *
   * @param salonId - The salon's MongoDB ObjectId
   * @param externalThreadId - Instagram PSID of the sender
   * @param clientName - Name of the Instagram user
   * @returns The conversation document
   */
  async findOrCreateInstagramConversation(
    salonId: string,
    externalThreadId: string,
    clientName: string,
  ): Promise<Conversation> {
    const salonObjectId = new Types.ObjectId(salonId);

    // Try to find existing Instagram conversation
    let conversation = await this.conversationModel.findOne({
      salonId: salonObjectId,
      channel: ConversationChannel.INSTAGRAM,
      externalThreadId,
    }).exec();

    // Create new conversation if it doesn't exist
    if (!conversation) {
      this.logger.log(
        `Creating new Instagram conversation: salon=${salonId}, psid=${externalThreadId}, client=${clientName}`,
      );

      // For Instagram conversations, we create a placeholder client ID
      // In production, you might want to create a proper user record
      const placeholderClientId = new Types.ObjectId();

      conversation = await this.conversationModel.create({
        participants: [placeholderClientId, salonObjectId],
        clientId: placeholderClientId,
        salonId: salonObjectId,
        channel: ConversationChannel.INSTAGRAM,
        externalThreadId,
        lastMessage: null,
        lastReadAt: [],
        isArchived: false,
      });
    }

    return conversation;
  }

  /**

  /**
   * Get all conversations for a user with unread count.
   * For clients: returns conversations where they are the client.
   * For salon owners: returns conversations where they own the salon.
   */
  async getUserConversations(
    userId: string,
    userSalonId?: string,
  ): Promise<ConversationWithUnread[]> {
    const userObjectId = new Types.ObjectId(userId);

    // Build query based on whether user is salon owner or client
    const query: { isArchived: boolean; salonId?: Types.ObjectId; clientId?: Types.ObjectId } = {
      isArchived: false
    };

    if (userSalonId) {
      // User is a salon owner - get conversations for their salon
      query.salonId = new Types.ObjectId(userSalonId);
    } else {
      // User is a client - get their conversations
      query.clientId = userObjectId;
    }

    const conversations = await this.conversationModel
      .find(query)
      .sort({ 'lastMessage.sentAt': -1 })
      .exec();

    // Calculate unread count for each conversation
    const conversationsWithUnread: ConversationWithUnread[] = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await this.getUnreadCount(conv._id.toString(), userId);
        return {
          ...conv.toObject(),
          unreadCount,
        };
      })
    );

    return conversationsWithUnread;
  }

  /**
   * Get paginated messages for a conversation.
   * Messages are returned oldest-first for proper chat history display.
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedMessages> {
    const conversationObjectId = new Types.ObjectId(conversationId);

    // Verify user is a participant
    const conversation = await this.conversationModel.findById(conversationObjectId).exec();
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const userObjectId = new Types.ObjectId(userId);
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userObjectId.toString()
    );

    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get total count
    const total = await this.messageModel.countDocuments({
      conversationId: conversationObjectId,
      isDeleted: false,
    });

    // Get messages (oldest first for chat history)
    const messages = await this.messageModel
      .find({
        conversationId: conversationObjectId,
        isDeleted: false,
      })
      .sort({ createdAt: 1 }) // Ascending order (oldest first)
      .skip(skip)
      .limit(limit)
      .exec();

    // Mark messages as read for this user
    await this.markMessagesAsRead(conversationId, userId);

    return {
      messages,
      total,
      page,
      limit,
      hasMore: skip + messages.length < total,
    };
  }

  /**
   * Soft delete a message (sets isDeleted flag and replaces body).
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const messageObjectId = new Types.ObjectId(messageId);
    const userObjectId = new Types.ObjectId(userId);

    const message = await this.messageModel.findById(messageObjectId).exec();

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Verify user is the sender
    if (message.senderId.toString() !== userObjectId.toString()) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    // Soft delete
    message.isDeleted = true;
    message.body = 'Message deleted';
    message.mediaUrl = null;
    await message.save();

    this.logger.log(`Message ${messageId} soft-deleted by user ${userId}`);
  }

  /**
   * Mark all unread messages in a conversation as read for a user.
   */
  private async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    const conversationObjectId = new Types.ObjectId(conversationId);
    const userObjectId = new Types.ObjectId(userId);

    // Update all unread messages from other users
    await this.messageModel.updateMany(
      {
        conversationId: conversationObjectId,
        senderId: { $ne: userObjectId },
        deliveryStatus: { $ne: DeliveryStatus.READ },
      },
      {
        $set: { deliveryStatus: DeliveryStatus.READ },
      }
    ).exec();

    // Update lastReadAt in conversation
    const conversation = await this.conversationModel.findById(conversationObjectId).exec();
    if (conversation) {
      const existingReadIndex = conversation.lastReadAt.findIndex(
        (r) => r.userId.toString() === userObjectId.toString()
      );

      if (existingReadIndex >= 0) {
        conversation.lastReadAt[existingReadIndex].readAt = new Date();
      } else {
        conversation.lastReadAt.push({
          userId: userObjectId,
          readAt: new Date(),
        });
      }

      await conversation.save();
    }
  }

  /**
   * Get the count of unread messages in a conversation for a user.
   */
  private async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    const conversationObjectId = new Types.ObjectId(conversationId);
    const userObjectId = new Types.ObjectId(userId);

    const count = await this.messageModel.countDocuments({
      conversationId: conversationObjectId,
      senderId: { $ne: userObjectId },
      deliveryStatus: { $ne: DeliveryStatus.READ },
      isDeleted: false,
    });

    return count;
  }

  /**
   * Create a new message and update conversation lastMessage.
   * Used by WebSocket gateway for real-time messaging.
   */
  async createMessage(
    conversationId: string,
    senderId: string,
    senderName: string,
    senderRole: string,
    body: string,
    channel: MessageChannel,
    mediaUrl?: string | null,
  ): Promise<MessageDocument> {
    const conversationObjectId = new Types.ObjectId(conversationId);
    const senderObjectId = new Types.ObjectId(senderId);

    // Verify conversation exists
    const conversation = await this.conversationModel.findById(conversationObjectId).exec();
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Verify sender is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === senderObjectId.toString()
    );
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    // Create message
    const message = await this.messageModel.create({
      conversationId: conversationObjectId,
      senderId: senderObjectId,
      senderName,
      senderRole,
      body,
      mediaUrl: mediaUrl || null,
      channel,
      deliveryStatus: DeliveryStatus.SENT,
      isDeleted: false,
    });

    // Update conversation lastMessage
    conversation.lastMessage = {
      body,
      senderId: senderObjectId,
      sentAt: new Date(),
    };
    await conversation.save();

    this.logger.log(`Message created in conversation ${conversationId} by user ${senderId}`);

    return message;
  }

  /**
   * Send a message (internal or WhatsApp) and handle routing based on channel.
   * This is the main method used by the WebSocket gateway or REST API.
   *
   * @param conversationId - The conversation ID
   * @param senderId - User ID of the sender
   * @param senderName - Display name of the sender
   * @param senderRole - Role of the sender
   * @param body - Message text
   * @param mediaUrl - Optional media URL
   * @returns The created message document
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    senderName: string,
    senderRole: string,
    body: string,
    mediaUrl?: string | null,
  ): Promise<MessageDocument> {
    const conversationObjectId = new Types.ObjectId(conversationId);

    // Get the conversation to check the channel
    const conversation = await this.conversationModel.findById(conversationObjectId).exec();
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Determine the message channel based on conversation channel
    let messageChannel: MessageChannel;
    if (conversation.channel === ConversationChannel.WHATSAPP) {
      messageChannel = MessageChannel.WHATSAPP;
    } else if (conversation.channel === ConversationChannel.INSTAGRAM) {
      messageChannel = MessageChannel.INSTAGRAM;
    } else {
      messageChannel = MessageChannel.INTERNAL;
    }

    // Create the message in the database
    const message = await this.createMessage(
      conversationId,
      senderId,
      senderName,
      senderRole,
      body,
      messageChannel,
      mediaUrl,
    );

    // If this is a WhatsApp conversation, send via WhatsApp API
    if (conversation.channel === ConversationChannel.WHATSAPP && conversation.externalThreadId) {
      try {
        if (this.whatsappSendService) {
          if (mediaUrl) {
            await this.whatsappSendService.sendMediaMessage(
              conversation.externalThreadId,
              mediaUrl,
              body,
            );
          } else {
            await this.whatsappSendService.sendMessage(
              conversation.externalThreadId,
              body,
            );
          }
          this.logger.log(`WhatsApp message sent to ${conversation.externalThreadId}`);
        } else {
          this.logger.warn('WhatsappSendService not available, message saved but not sent to WhatsApp');
        }
      } catch (error) {
        this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
        // Message is already saved in DB, so we don't throw
        // The salon owner can see the message in the chat history
      }
    }

    // If this is an Instagram conversation, send via Instagram API
    if (conversation.channel === ConversationChannel.INSTAGRAM && conversation.externalThreadId) {
      try {
        if (this.instagramSendService) {
          if (mediaUrl) {
            await this.instagramSendService.sendImageMessage(
              conversation.externalThreadId,
              mediaUrl,
            );
          } else {
            await this.instagramSendService.sendMessage(
              conversation.externalThreadId,
              body,
            );
          }
          this.logger.log(`Instagram message sent to ${conversation.externalThreadId}`);
        } else {
          this.logger.warn('InstagramSendService not available, message saved but not sent to Instagram');
        }
      } catch (error) {
        this.logger.error(`Failed to send Instagram message: ${error.message}`);
        // Message is already saved in DB, so we don't throw
        // The salon owner can see the message in the chat history
      }
    }

    return message;
  }

  /**
   * Mark messages as read and return the updated readAt timestamp.
   * Used by WebSocket gateway for real-time read receipts.
   */
  async updateReadStatus(conversationId: string, userId: string): Promise<Date> {
    await this.markMessagesAsRead(conversationId, userId);

    // Return the current timestamp
    const readAt = new Date();
    return readAt;
  }

  /**
   * Get the other participant's ID in a conversation.
   * Useful for sending notifications to the recipient.
   */
  async getOtherParticipant(conversationId: string, currentUserId: string): Promise<string | null> {
    const conversationObjectId = new Types.ObjectId(conversationId);
    const conversation = await this.conversationModel.findById(conversationObjectId).exec();

    if (!conversation) {
      return null;
    }

    const currentUserObjectId = new Types.ObjectId(currentUserId);
    const otherParticipant = conversation.participants.find(
      (p) => p.toString() !== currentUserObjectId.toString()
    );

    return otherParticipant?.toString() || null;
  }

  /**
   * Verify if a user is a participant in a conversation.
   */
  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const conversationObjectId = new Types.ObjectId(conversationId);
    const userObjectId = new Types.ObjectId(userId);

    const conversation = await this.conversationModel.findById(conversationObjectId).exec();
    if (!conversation) {
      return false;
    }

    return conversation.participants.some(
      (p) => p.toString() === userObjectId.toString()
    );
  }
}

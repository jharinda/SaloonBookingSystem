export enum MessageChannel {
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  SNAPSALON = 'snapsalon'
}

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  channel: MessageChannel;
  status: MessageStatus;
  timestamp: Date;
  isFromUser?: boolean;
}

export interface Conversation {
  _id: string;
  participantId: string;
  participantName: string;
  participantAvatar?: string;
  channel: MessageChannel;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

export interface SendMessagePayload {
  conversationId: string;
  content: string;
  channel: MessageChannel;
}

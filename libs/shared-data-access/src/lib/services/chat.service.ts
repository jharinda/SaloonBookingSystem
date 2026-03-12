import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ConversationResponse {
  _id: string;
  participants: string[];
  salonId: string;
  clientId: string;
  channel: 'internal' | 'whatsapp' | 'instagram';
  externalThreadId: string | null;
  lastMessage: {
    body: string;
    senderId: string;
    sentAt: string;
  } | null;
  lastReadAt: Array<{
    userId: string;
    readAt: string;
  }>;
  isArchived: boolean;
  unreadCount: number;
  clientName?: string;
  clientAvatar?: string;
  salonName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageResponse {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  mediaUrl: string | null;
  channel: 'internal' | 'whatsapp' | 'instagram';
  deliveryStatus: 'sent' | 'delivered' | 'read';
  isDeleted: boolean;
  createdAt: string;
}

export interface PaginatedMessagesResponse {
  messages: MessageResponse[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3009/api'; // Chat service port

  /**
   * Create or get existing conversation with a salon
   */
  createConversation(salonId: string): Observable<ConversationResponse> {
    return this.http.post<ConversationResponse>(`${this.apiUrl}/chat/conversations`, {
      salonId
    });
  }

  /**
   * Get all conversations for the current user
   */
  getConversations(): Observable<ConversationResponse[]> {
    return this.http.get<ConversationResponse[]>(`${this.apiUrl}/chat/conversations`);
  }

  /**
   * Get messages for a conversation with pagination
   */
  getConversationMessages(
    conversationId: string,
    page = 1,
    limit = 50
  ): Observable<PaginatedMessagesResponse> {
    return this.http.get<PaginatedMessagesResponse>(
      `${this.apiUrl}/chat/conversations/${conversationId}/messages`,
      { params: { page: page.toString(), limit: limit.toString() } }
    );
  }

  /**
   * Delete a message (soft delete)
   */
  deleteMessage(messageId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/chat/messages/${messageId}`);
  }
}

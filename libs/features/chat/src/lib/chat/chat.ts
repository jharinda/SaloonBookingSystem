import { Component, OnInit, OnDestroy, signal, effect, ViewChild, ElementRef, inject, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { SocketService } from '@org/shared/socket';
import { ChatService, ConversationResponse, MessageResponse, PaginatedMessagesResponse, AuthService, ActiveChatService } from '@org/shared-data-access';
import {
  Conversation,
  Message,
  MessageChannel,
  MessageStatus
} from '@org/models';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'lib-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  standalone: true,
  imports: [CommonModule, FormsModule, ToastModule],
  providers: [MessageService],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly activeChatService = inject(ActiveChatService);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('messageContainer') messageContainer?: ElementRef<HTMLDivElement>;

  // Signals for reactive state
  conversations = signal<Conversation[]>([]);
  messages = signal<Message[]>([]);
  selectedConversation = signal<Conversation | null>(null);
  typingUsers = signal<Map<string, string>>(new Map());
  messageInput = signal<string>('');
  showConversationList = signal<boolean>(true);
  isConnected = signal<boolean>(false);
  isLoadingConversations = signal<boolean>(true);
  isLoadingMessages = signal<boolean>(false);

  // New signals for modern UI
  searchQuery = signal<string>('');
  filteredConversations = signal<Conversation[]>([]);
  showEmojiPicker = signal<boolean>(false);
  showChatMenu = signal<boolean>(false);
  searchInChatActive = signal<boolean>(false);

  // Channel icons for display
  readonly MessageChannel = MessageChannel;

  private wasAtBottom = true;

  // Track processed messages to prevent duplicate handling (backend emits to multiple rooms)
  private processedMessageIds = new Set<string>();

  constructor() {
    // Auto-scroll effect when messages change
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > 0 && this.wasAtBottom) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });

    // Auto-update filteredConversations when conversations change
    effect(() => {
      const convs = this.conversations();
      const query = this.searchQuery();
      if (!query) {
        this.filteredConversations.set(convs);
      }
    });
  }

  ngOnInit(): void {
    this.setupSocketListeners();
    this.loadConversations();
    this.handleIncomingSalonData();

    // Join salon room if user is a salon owner (socket is already connected by notification-inbox.service)
    const currentUser = this.authService.currentUser();
    if (currentUser?.role === 'salon_owner') {
      this.socketService.emit('join_salon_room', { salonId: currentUser.sub });
    }
  }

  ngOnDestroy(): void {
    this.activeChatService.clearActiveConversation();
    this.destroy$.next();
    this.destroy$.complete();
    // Note: Don't disconnect socket - it's managed globally by notification-inbox.service
  }

  private setupSocketListeners(): void {
    // Check if socket is connected
    this.isConnected.set(this.socketService.isConnected());

    // Listen for connection status changes
    this.socketService.fromEvent<void>('connect')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isConnected.set(true);

        // Rejoin salon room if user is a salon owner
        const currentUser = this.authService.currentUser();
        if (currentUser?.role === 'salon_owner') {
          this.socketService.emit('join_salon_room', { salonId: currentUser.sub });
        }

        // Rejoin current conversation if any
        const currentConv = this.selectedConversation();
        if (currentConv) {
          this.joinConversationRoom(currentConv._id);
        }
      });

    this.socketService.fromEvent<void>('disconnect')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isConnected.set(false);
      });

    // Listen for new messages
    this.socketService.fromEvent<{ message: MessageResponse }>('new_message')
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ message }) => {
        this.handleNewMessage(message);
      });

    // Listen for typing indicators
    this.socketService.fromEvent<{ userId: string; conversationId: string }>('user_typing')
      .pipe(takeUntil(this.destroy$))
      .subscribe((indicator) => {
        this.handleTypingIndicator(indicator);
      });

    // Listen for message read receipts
    this.socketService.fromEvent<{ conversationId: string; userId: string; readAt: string }>('messages_read')
      .pipe(takeUntil(this.destroy$))
      .subscribe((update) => {
        this.updateMessageReadStatus(update.conversationId, update.userId);
      });
  }

  private loadConversations(): void {
    this.isLoadingConversations.set(true);

    this.chatService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (convs: ConversationResponse[]) => {
          this.conversations.set(this.mapConversations(convs));
          this.isLoadingConversations.set(false);
        },
        error: () => {
          this.messageService.add({ severity: 'error', summary: 'Chat',
            detail: 'Could not load conversations. Please try again.' });
          this.isLoadingConversations.set(false);
        }
      });
  }

  private mapConversations(apiConvs: ConversationResponse[]): Conversation[] {
    const currentUser = this.authService.currentUser();
    const isSalonOwner = currentUser?.role === 'salon_owner';

    const mapped = apiConvs.map(conv => ({
      _id: conv._id,
      participantId: isSalonOwner ? conv.clientId : conv.salonId,
      participantName: isSalonOwner ? (conv.clientName || 'Client') : (conv.salonName || 'Salon'),
      participantAvatar: isSalonOwner ? conv.clientAvatar : undefined,
      channel: conv.channel === 'whatsapp' ? MessageChannel.WHATSAPP :
               conv.channel === 'instagram' ? MessageChannel.INSTAGRAM :
               MessageChannel.SNAPSALON,
      lastMessage: conv.lastMessage?.body || '',
      lastMessageTime: conv.lastMessage ? new Date(conv.lastMessage.sentAt) : new Date(),
      unreadCount: conv.unreadCount
    }));

    // Initialize filtered conversations
    this.filteredConversations.set(mapped);

    return mapped;
  }

  private handleIncomingSalonData(): void {
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state || (history.state as { salon?: { id: string; name: string; avatar: string | null } });

    if (state?.['salon']) {
      const salonData = state['salon'] as { id: string; name: string; avatar: string | null };

      // Create or get conversation with this salon
      this.chatService.createConversation(salonData.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (conv: ConversationResponse) => {

            // Map to frontend conversation model
            const conversation: Conversation = {
              _id: conv._id,
              participantId: conv.salonId,
              participantName: salonData.name,
              participantAvatar: salonData.avatar || undefined,
              channel: MessageChannel.SNAPSALON,
              lastMessage: conv.lastMessage?.body || '',
              lastMessageTime: conv.lastMessage ? new Date(conv.lastMessage.sentAt) : new Date(),
              unreadCount: conv.unreadCount
            };

            // Add to conversations list if not already present
            const exists = this.conversations().find(c => c._id === conversation._id);
            if (!exists) {
              this.conversations.update(convs => [conversation, ...convs]);
            } else {
              // Update existing
              this.conversations.update(convs =>
                convs.map(c => c._id === conversation._id ? conversation : c)
              );
            }

            // Select the conversation
            this.selectConversation(conversation);
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Chat',
              detail: 'Could not start conversation. Please try again.' });
          }
        });
    }
  }

  selectConversation(conversation: Conversation): void {
    this.selectedConversation.set(conversation);
    this.activeChatService.setActiveConversation(conversation._id);
    this.loadMessages(conversation._id);
    this.joinConversationRoom(conversation._id);

    // On mobile, hide conversation list when selecting a chat
    if (window.innerWidth < 768) {
      this.showConversationList.set(false);
    }
  }

  private loadMessages(conversationId: string): void {
    this.isLoadingMessages.set(true);

    this.chatService.getConversationMessages(conversationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: PaginatedMessagesResponse) => {
          this.messages.set(this.mapMessages(result.messages));
          this.isLoadingMessages.set(false);

          // Mark as read
          this.markConversationAsRead(conversationId);
        },
        error: () => {
          this.messageService.add({ severity: 'error', summary: 'Chat',
            detail: 'Could not load messages. Please try again.' });
          this.isLoadingMessages.set(false);
        }
      });
  }

  private mapMessages(apiMessages: MessageResponse[]): Message[] {
    const currentUserId = this.authService.currentUser()?.sub;

    return apiMessages.map(msg => ({
      _id: msg._id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      content: msg.body,
      channel: msg.channel === 'whatsapp' ? MessageChannel.WHATSAPP :
               msg.channel === 'instagram' ? MessageChannel.INSTAGRAM :
               MessageChannel.SNAPSALON,
      status: msg.deliveryStatus === 'read' ? MessageStatus.READ :
              msg.deliveryStatus === 'delivered' ? MessageStatus.DELIVERED :
              MessageStatus.SENT,
      timestamp: new Date(msg.createdAt),
      isFromUser: msg.senderId === currentUserId
    }));
  }

  private joinConversationRoom(conversationId: string): void {
    this.socketService.emit('join_conversation', { conversationId });
  }

  sendMessage(): void {
    const content = this.messageInput().trim();
    const conversation = this.selectedConversation();

    if (!content || !conversation) {
      return;
    }

    // Send via WebSocket
    this.socketService.emit('send_message', {
      conversationId: conversation._id,
      body: content,
      mediaUrl: null
    });

    // Clear input
    this.messageInput.set('');
    this.stopTyping();
  }

  onTyping(): void {
    const conversation = this.selectedConversation();
    if (!conversation) return;

    this.socketService.emit('typing', {
      conversationId: conversation._id
    });
  }

  private stopTyping(): void {
    // Typing indicator will automatically clear after timeout on backend
  }

  private handleNewMessage(apiMessage: MessageResponse): void {
    // Deduplicate: backend emits to multiple rooms (conversation + salon/user rooms)
    // causing the same message event to arrive multiple times
    if (this.processedMessageIds.has(apiMessage._id)) {
      console.log('⏭️ Skipping duplicate message event:', apiMessage._id);
      return;
    }

    // Mark as processed
    this.processedMessageIds.add(apiMessage._id);

    // Clean up old entries to prevent memory leak (keep last 100 message IDs)
    if (this.processedMessageIds.size > 100) {
      const idsArray = Array.from(this.processedMessageIds);
      this.processedMessageIds = new Set(idsArray.slice(-100));
    }

    const currentConversation = this.selectedConversation();

    // Map API message to frontend model
    const message: Message = this.mapMessages([apiMessage])[0];

    // Add message if it belongs to current conversation
    if (currentConversation && apiMessage.conversationId === currentConversation._id) {
      this.messages.update(msgs => [...msgs, message]);
    }

    // Update conversation list
    this.updateConversationWithMessage(apiMessage);

    // Note: Notifications are handled globally by NotificationInboxService
    // which checks if user is actively viewing this conversation
  }

  private handleTypingIndicator(indicator: { userId: string; conversationId: string }): void {
    this.typingUsers.update(users => {
      const newUsers = new Map(users);
      newUsers.set(indicator.conversationId, 'User'); // TODO: Get actual user name
      return newUsers;
    });

    // Clear typing after 3 seconds
    setTimeout(() => {
      this.typingUsers.update(users => {
        const newUsers = new Map(users);
        newUsers.delete(indicator.conversationId);
        return newUsers;
      });
    }, 3000);
  }

  private updateMessageReadStatus(conversationId: string, userId: string): void {
    const currentConv = this.selectedConversation();
    if (currentConv && currentConv._id === conversationId) {
      this.messages.update(msgs =>
        msgs.map(msg => {
          if (msg.senderId !== userId) {
            return { ...msg, status: MessageStatus.READ };
          }
          return msg;
        })
      );
    }

    // Clear unread count for this conversation when other participant reads messages
    const currentUserId = this.authService.currentUser()?.sub;
    if (userId !== currentUserId) {
      this.conversations.update(convs =>
        convs.map(conv => conv._id === conversationId ? { ...conv, unreadCount: 0 } : conv)
      );
      this.filterConversations();
    }
  }

  private updateConversationWithMessage(apiMessage: MessageResponse): void {
    const currentUserId = this.authService.currentUser()?.sub;
    const isOwnMessage = apiMessage.senderId === currentUserId;
    const isActiveConversation = this.selectedConversation()?._id === apiMessage.conversationId;

    this.conversations.update(convs => {
      const updated = convs.map(conv => {
        if (conv._id === apiMessage.conversationId) {
          // Don't increment unread count if:
          // 1. It's the user's own message
          // 2. The conversation is currently active/selected
          const shouldIncrementUnread = !isOwnMessage && !isActiveConversation;

          return {
            ...conv,
            lastMessage: apiMessage.body,
            lastMessageTime: new Date(apiMessage.createdAt),
            unreadCount: shouldIncrementUnread ? conv.unreadCount + 1 : conv.unreadCount
          };
        }
        return conv;
      });

      // Sort by lastMessageTime descending (most recent first)
      return updated.sort((a, b) => {
        const timeA = a.lastMessageTime?.getTime() ?? 0;
        const timeB = b.lastMessageTime?.getTime() ?? 0;
        return timeB - timeA;
      });
    });

    // Update filtered conversations too
    this.filterConversations();
  }

  private markConversationAsRead(conversationId: string): void {
    // Emit mark_read event to socket
    this.socketService.emit('mark_read', { conversationId });

    // Update local state
    this.conversations.update(convs =>
      convs.map(conv => conv._id === conversationId ? { ...conv, unreadCount: 0 } : conv)
    );

    // Update filtered conversations to reflect the change
    this.filterConversations();
  }

  private scrollToBottom(smooth = true): void {
    if (!this.messageContainer) return;

    const element = this.messageContainer.nativeElement;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  onMessageScroll(event: Event): void {
    const element = event.target as HTMLDivElement;
    const threshold = 50;
    this.wasAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
  }

  backToConversations(): void {
    this.showConversationList.set(true);
    this.selectedConversation.set(null);
  }

  getChannelIcon(channel: MessageChannel): string {
    switch (channel) {
      case MessageChannel.WHATSAPP:
        return '📱';
      case MessageChannel.INSTAGRAM:
        return '📷';
      case MessageChannel.SNAPSALON:
        return '💬';
      default:
        return '💬';
    }
  }

  getStatusIcon(status: MessageStatus): string {
    switch (status) {
      case MessageStatus.SENT:
        return '✓';
      case MessageStatus.DELIVERED:
        return '✓✓';
      case MessageStatus.READ:
        return '✓✓';
      default:
        return '';
    }
  }

  formatTime(date: Date): string {
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now.getTime() - messageDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return messageDate.toLocaleDateString();
  }

  formatMessageTime(date: Date): string {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  shouldShowTimestamp(index: number): boolean {
    if (index === 0) return true;

    const messages = this.messages();
    const currentMessage = messages[index];
    const prevMessage = messages[index - 1];

    const timeDiff = new Date(currentMessage.timestamp).getTime() -
                     new Date(prevMessage.timestamp).getTime();

    return timeDiff > 300000; // 5 minutes
  }

  // ── New Helper Methods for Modern UI ────────────────────────────────────────

  /**
   * Get initials from a name for avatar fallback
   */
  getInitials(name: string): string {
    if (!name) return '?';

    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Format channel name for display
   */
  formatChannelName(channel: MessageChannel): string {
    switch (channel) {
      case MessageChannel.WHATSAPP:
        return 'WhatsApp';
      case MessageChannel.INSTAGRAM:
        return 'Instagram';
      case MessageChannel.SNAPSALON:
        return 'SnapSalon';
      default:
        return 'Chat';
    }
  }

  /**
   * Filter conversations based on search query
   */
  filterConversations(): void {
    const query = this.searchQuery().toLowerCase().trim();

    if (!query) {
      this.filteredConversations.set(this.conversations());
      return;
    }

    const filtered = this.conversations().filter(conv =>
      conv.participantName.toLowerCase().includes(query) ||
      (conv.lastMessage || '').toLowerCase().includes(query)
    );

    this.filteredConversations.set(filtered);
  }

  /**
   * Clear search query
   */
  clearSearch(): void {
    this.searchQuery.set('');
    this.filteredConversations.set(this.conversations());
  }

  /**
   * Check if typing indicator should be shown
   */
  isTyping(): boolean {
    const conv = this.selectedConversation();
    return conv ? this.typingUsers().has(conv._id) : false;
  }

  /**
   * Get the name of the user who is typing
   */
  typingUserName(): string {
    const conv = this.selectedConversation();
    return conv ? (this.typingUsers().get(conv._id) || 'Someone') : '';
  }

  /**
   * Check if date divider should be shown
   */
  shouldShowDateDivider(index: number): boolean {
    if (index === 0) return true;

    const messages = this.messages();
    const currentMessage = messages[index];
    const prevMessage = messages[index - 1];

    const currentDate = new Date(currentMessage.timestamp).toDateString();
    const prevDate = new Date(prevMessage.timestamp).toDateString();

    return currentDate !== prevDate;
  }

  /**
   * Format date for divider (e.g., "Today", "Yesterday", "Jan 15, 2024")
   */
  formatDateDivider(date: Date): string {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return messageDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  /**
   * Check if avatar should be shown for this message
   */
  shouldShowAvatar(index: number): boolean {
    const messages = this.messages();
    const currentMessage = messages[index];

    // Always show for first message
    if (index === 0) return !currentMessage.isFromUser;

    const nextMessage = messages[index + 1];

    // Show if next message is from different sender or doesn't exist
    if (!nextMessage || nextMessage.senderId !== currentMessage.senderId) {
      return !currentMessage.isFromUser;
    }

    // Show if more than 5 minutes between messages
    const timeDiff = new Date(nextMessage.timestamp).getTime() -
                     new Date(currentMessage.timestamp).getTime();
    return timeDiff > 300000 && !currentMessage.isFromUser;
  }

  /**
   * Check if sender name should be shown
   */
  shouldShowSenderName(index: number): boolean {
    const messages = this.messages();
    const currentMessage = messages[index];

    if (currentMessage.isFromUser) return false;
    if (index === 0) return true;

    const prevMessage = messages[index - 1];
    return prevMessage.senderId !== currentMessage.senderId;
  }

  /**
   * Toggle emoji picker
   */
  toggleEmojiPicker(): void {
    this.showEmojiPicker.update(show => !show);
  }

  /**
   * Open file picker for attachments
   */
  openFilePicker(): void {
    // TODO: Implement file picker
    this.messageService.add({
      severity: 'info',
      summary: 'Coming Soon',
      detail: 'File attachments will be available soon!'
    });
  }

  /**
   * Toggle search in current chat
   */
  toggleSearchInChat(): void {
    this.searchInChatActive.update(active => !active);
  }

  /**
   * Open chat options menu
   */
  openChatMenu(): void {
    this.showChatMenu.update(show => !show);
  }
}

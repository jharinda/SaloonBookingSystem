import { Component, OnInit, OnDestroy, signal, effect, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SocketService } from '@org/shared/socket';
import {
  Conversation,
  Message,
  MessageChannel,
  MessageStatus,
  TypingIndicator,
  SendMessagePayload
} from '@org/shared/models/chat.models';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);
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

  // Channel icons for display
  readonly MessageChannel = MessageChannel;

  private wasAtBottom = true;

  constructor() {
    // Auto-scroll effect when messages change
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > 0 && this.wasAtBottom) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });
  }

  ngOnInit(): void {
    // Configure socket URL from environment if available
    try {
      // Try to get the environment URL dynamically
      const envApiUrl = (window as any)['__env']?.apiUrl || 'http://localhost:3000';
      this.socketService.setSocketUrl(envApiUrl);
    } catch (e) {
      // Fallback to default
      console.log('Using default socket URL');
    }

    this.connectSocket();
    this.loadConversations();
    this.setupSocketListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.socketService.disconnect();
  }

  private connectSocket(): void {
    this.socketService.connect();
    this.isConnected.set(this.socketService.isConnected());
  }

  private setupSocketListeners(): void {
    // Listen for new messages
    this.socketService.fromEvent<Message>('new_message')
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        this.handleNewMessage(message);
      });

    // Listen for typing indicators
    this.socketService.fromEvent<TypingIndicator>('user_typing')
      .pipe(takeUntil(this.destroy$))
      .subscribe((indicator) => {
        this.handleTypingIndicator(indicator);
      });

    // Listen for message status updates
    this.socketService.fromEvent<{ messageId: string; status: MessageStatus }>('message_status')
      .pipe(takeUntil(this.destroy$))
      .subscribe((update) => {
        this.updateMessageStatus(update.messageId, update.status);
      });

    // Listen for conversation updates
    this.socketService.fromEvent<Conversation>('conversation_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe((conversation) => {
        this.updateConversation(conversation);
      });
  }

  private loadConversations(): void {
    // Mock data for now - replace with actual API call
    const mockConversations: Conversation[] = [
      {
        _id: '1',
        participantId: 'user1',
        participantName: 'Sarah Johnson',
        participantAvatar: 'https://i.pravatar.cc/150?img=1',
        channel: MessageChannel.WHATSAPP,
        lastMessage: 'Hi! I would like to book an appointment',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 5),
        unreadCount: 2
      },
      {
        _id: '2',
        participantId: 'user2',
        participantName: 'Mike Davis',
        channel: MessageChannel.INSTAGRAM,
        lastMessage: 'Thanks for the great service!',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 30),
        unreadCount: 0
      },
      {
        _id: '3',
        participantId: 'user3',
        participantName: 'Emma Wilson',
        participantAvatar: 'https://i.pravatar.cc/150?img=3',
        channel: MessageChannel.SNAPSALON,
        lastMessage: 'What time slots are available tomorrow?',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 2),
        unreadCount: 1
      }
    ];

    this.conversations.set(mockConversations);
  }

  selectConversation(conversation: Conversation): void {
    this.selectedConversation.set(conversation);
    this.loadMessages(conversation._id);
    this.markConversationAsRead(conversation._id);

    // On mobile, hide conversation list when selecting a chat
    if (window.innerWidth < 768) {
      this.showConversationList.set(false);
    }
  }

  private loadMessages(conversationId: string): void {
    // Mock messages - replace with actual API call
    const mockMessages: Message[] = [
      {
        _id: 'm1',
        conversationId,
        senderId: 'user1',
        senderName: 'Sarah Johnson',
        content: 'Hi! I would like to book an appointment',
        channel: MessageChannel.WHATSAPP,
        status: MessageStatus.READ,
        timestamp: new Date(Date.now() - 1000 * 60 * 10),
        isFromUser: false
      },
      {
        _id: 'm2',
        conversationId,
        senderId: 'salon1',
        content: 'Hello! I would be happy to help you. What service are you interested in?',
        channel: MessageChannel.WHATSAPP,
        status: MessageStatus.READ,
        timestamp: new Date(Date.now() - 1000 * 60 * 8),
        isFromUser: true
      },
      {
        _id: 'm3',
        conversationId,
        senderId: 'user1',
        senderName: 'Sarah Johnson',
        content: 'I\'m looking for a haircut and color treatment',
        channel: MessageChannel.WHATSAPP,
        status: MessageStatus.DELIVERED,
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        isFromUser: false
      }
    ];

    this.messages.set(mockMessages);
  }

  sendMessage(): void {
    const content = this.messageInput().trim();
    const conversation = this.selectedConversation();

    if (!content || !conversation) {
      return;
    }

    const payload: SendMessagePayload = {
      conversationId: conversation._id,
      content,
      channel: conversation.channel
    };

    // Emit to server
    this.socketService.emit('send_message', payload);

    // Optimistically add message to UI
    const newMessage: Message = {
      _id: `temp-${Date.now()}`,
      conversationId: conversation._id,
      senderId: 'current-user',
      content,
      channel: conversation.channel,
      status: MessageStatus.SENT,
      timestamp: new Date(),
      isFromUser: true
    };

    this.messages.update(msgs => [...msgs, newMessage]);
    this.messageInput.set('');
    this.stopTyping();
  }

  onTyping(): void {
    const conversation = this.selectedConversation();
    if (!conversation) return;

    this.socketService.emit('typing', {
      conversationId: conversation._id,
      isTyping: true
    });
  }

  private stopTyping(): void {
    const conversation = this.selectedConversation();
    if (!conversation) return;

    this.socketService.emit('typing', {
      conversationId: conversation._id,
      isTyping: false
    });
  }

  private handleNewMessage(message: Message): void {
    const currentConversation = this.selectedConversation();

    // Add message if it belongs to current conversation
    if (currentConversation && message.conversationId === currentConversation._id) {
      this.messages.update(msgs => [...msgs, message]);
    }

    // Update conversation list
    this.updateConversationWithMessage(message);
  }

  private handleTypingIndicator(indicator: TypingIndicator): void {
    this.typingUsers.update(users => {
      const newUsers = new Map(users);
      if (indicator.isTyping) {
        newUsers.set(indicator.conversationId, indicator.userName);
      } else {
        newUsers.delete(indicator.conversationId);
      }
      return newUsers;
    });

    // Clear typing after 3 seconds
    if (indicator.isTyping) {
      setTimeout(() => {
        this.typingUsers.update(users => {
          const newUsers = new Map(users);
          newUsers.delete(indicator.conversationId);
          return newUsers;
        });
      }, 3000);
    }
  }

  private updateMessageStatus(messageId: string, status: MessageStatus): void {
    this.messages.update(msgs =>
      msgs.map(msg => msg._id === messageId ? { ...msg, status } : msg)
    );
  }

  private updateConversation(conversation: Conversation): void {
    this.conversations.update(convs =>
      convs.map(conv => conv._id === conversation._id ? conversation : conv)
    );
  }

  private updateConversationWithMessage(message: Message): void {
    this.conversations.update(convs =>
      convs.map(conv => {
        if (conv._id === message.conversationId) {
          return {
            ...conv,
            lastMessage: message.content,
            lastMessageTime: message.timestamp,
            unreadCount: message.isFromUser ? conv.unreadCount : conv.unreadCount + 1
          };
        }
        return conv;
      })
    );
  }

  private markConversationAsRead(conversationId: string): void {
    this.conversations.update(convs =>
      convs.map(conv => conv._id === conversationId ? { ...conv, unreadCount: 0 } : conv)
    );
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
}

import { computed, inject, Injectable, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';

import { AuthService, RealtimeNotificationService, ActiveChatService } from '@org/shared-data-access';
import { SocketService } from '@org/shared/socket';

export interface InboxItem {
  id: string;
  event: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  data: unknown;
}

const MAX_ITEMS = 50;
const STORAGE_PREFIX = 'snapsalon-notif-inbox-';

/**
 * Maps backend `NotificationType` values (stored in DB) to the SSE event names
 * used by `labelFromEvent` and the click-routing logic.
 */
function serverTypeToEvent(type: string): string {
  switch (type) {
    case 'booking_created':   return 'booking.new';
    case 'booking_confirmed': return 'booking.confirmed';
    case 'booking_cancelled': return 'booking.cancelled';
    case 'booking_completed': return 'booking.completed';
    case 'booking_reminder':  return 'booking.reminder.15min';
    case 'review_request':    return 'review.posted';
    case 'new_message':       return 'chat.new_message';
    default:                  return type;
  }
}

function labelFromEvent(event: string, data: unknown): { title: string; body: string } {
  const d = (data ?? {}) as Record<string, string>;

  switch (event) {
    case 'booking.new': {
      const rawDate = d['appointmentDate'] ?? '';
      const date = rawDate.length >= 10 ? rawDate.slice(0, 10) : rawDate;
      return {
        title: '📅 New Booking',
        body: `${d['clientName'] ?? 'A client'} booked ${d['serviceName'] ?? 'a service'} on ${date} at ${d['startTime'] ?? ''}`.trim(),
      };
    }
    case 'booking.confirmed':
      return {
        title: '✅ Booking Confirmed',
        body: `Booking #${d['bookingId'] ?? ''} has been confirmed.`,
      };
    case 'booking.cancelled':
      return {
        title: '❌ Booking Cancelled',
        body: `Booking #${d['bookingId'] ?? ''} was cancelled.`,
      };
    case 'booking.completed':
      return {
        title: '🎉 Booking Completed',
        body: `Booking #${d['bookingId'] ?? ''} is complete.`,
      };
    case 'booking.reminder.15min':
      return {
        title: '⏰ Appointment in 15 Minutes',
        body: `Your ${d['serviceName'] ?? 'appointment'} at ${d['salonName'] ?? ''} starts at ${d['startTime'] ?? ''}.`.trim(),
      };
    case 'booking.reminder.now':
      return {
        title: '🚀 Appointment Starting Now!',
        body: `Your ${d['serviceName'] ?? 'appointment'} at ${d['salonName'] ?? ''} is starting now!`.trim(),
      };
    case 'review.posted':
      return {
        title: '⭐ New Review Received',
        body: `${d['clientName'] ?? 'A client'} gave you ${d['rating'] ?? ''} stars${d['serviceName'] ? ' for ' + d['serviceName'] : ''}.`,
      };
    case 'chat.new_message':
      return {
        title: `💬 ${d['senderName'] ?? 'New message'}`,
        body: d['messageBody'] ?? 'You have a new chat message',
      };
    default:
      return { title: event, body: JSON.stringify(data) };
  }
}

@Injectable({ providedIn: 'root' })
export class NotificationInboxService {
  private readonly realtimeService = inject(RealtimeNotificationService);
  private readonly authService     = inject(AuthService);
  private readonly http            = inject(HttpClient);
  private readonly socketService   = inject(SocketService);
  private readonly messageService  = inject(MessageService);
  private readonly router          = inject(Router);
  private readonly destroyRef      = inject(DestroyRef);
  private readonly activeChatService = inject(ActiveChatService);

  private readonly _items = signal<InboxItem[]>([]);

  // Track recently processed messages to prevent duplicates
  private readonly processedMessages = new Set<string>();
  private readonly MESSAGE_DEDUP_TTL = 5000; // 5 seconds

  /** Read-only view of the inbox (newest first). */
  readonly items = this._items.asReadonly();

  /** Number of unread notifications. */
  readonly unreadCount = computed(() => this._items().filter(i => !i.read).length);

  constructor() {
    console.log('🏗️ NotificationInboxService: Constructor called');
    // Load any persisted notifications for the current user on startup.
    this.loadFromStorage();

    // When the user logs in or out, reload the inbox for the correct user.
    toObservable(this.authService.isLoggedIn)
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((loggedIn) => {
        console.log('🔐 NotificationInboxService: Login status changed:', loggedIn);
        if (loggedIn) {
          this.loadFromStorage();
          // Fetch any notifications the user missed while offline.
          this.fetchServerInbox();
          // Connect to chat socket for real-time messages
          this.connectChatSocket();
        } else {
          this._items.set([]);
          this.socketService.disconnect();
        }
      });

    // Append every arriving SSE notification to the inbox and show a toast.
    this.realtimeService.notifications$
      .pipe(takeUntilDestroyed())
      .subscribe(({ event, data }) => {
        this.addItem(event, data);
        const { title, body } = labelFromEvent(event, data);
        this.messageService.add({
          severity: 'info',
          summary: title,
          detail: body,
          life: 5000,
        });
      });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  markAllRead(): void {
    this._items.update(items => items.map(i => ({ ...i, read: true })));
    this.saveToStorage();
  }

  markRead(id: string): void {
    this._items.update(items =>
      items.map(i => (i.id === id ? { ...i, read: true } : i)),
    );
    this.saveToStorage();
  }

  clearAll(): void {
    this._items.set([]);
    this.saveToStorage();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private storageKey(): string {
    const userId = this.authService.currentUser()?.sub ?? 'guest';
    return `${STORAGE_PREFIX}${userId}`;
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey());
      this._items.set(raw ? (JSON.parse(raw) as InboxItem[]) : []);
    } catch {
      this._items.set([]);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this._items()));
    } catch {
      // localStorage full / unavailable — silently ignore.
    }
  }

  private addItem(event: string, data: unknown, id?: string): void {
    const { title, body } = labelFromEvent(event, data);
    const itemId = id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Deduplicate: ignore if an item with this id is already in the inbox.
    if (this._items().some(i => i.id === itemId)) return;

    const item: InboxItem = {
      id: itemId,
      event,
      title,
      body,
      timestamp: Date.now(),
      read: false,
      data,
    };
    const updated = [item, ...this._items()].slice(0, MAX_ITEMS);
    this._items.set(updated);
    this.saveToStorage();
  }

  /**
   * Fetches persisted notifications from the server for the current user and
   * merges any that are not already in the local inbox.
   * Uses the server-assigned MongoDB `_id` as the item id so that the same
   * notification is never added twice regardless of browser session.
   */
  private fetchServerInbox(): void {
    this.http
      .get<{
        notifications: {
          _id: string;
          title: string;
          body: string;
          type: string;
          data: Record<string, unknown>;
          isRead: boolean;
          createdAt: string;
        }[];
        total: number;
        page: number;
        limit: number;
        unreadCount: number;
      }>(
        '/api/notifications/inbox',
      )
      .subscribe({
        next: (response) => {
          // Add in reverse (oldest first) so the final order is newest-first.
          const reversed = [...response.notifications].reverse();
          for (const s of reversed) {
            const itemId = `srv-${s._id}`;
            if (this._items().some(i => i.id === itemId)) continue;

            // Map server type (e.g. "booking_created") → SSE event name
            // (e.g. "booking.new") for consistent click-routing behaviour.
            const event = serverTypeToEvent(s.type);

            // Use title & body stored on the server.
            // Fall back to labelFromEvent only when the server fields are empty.
            const hasServerLabel = !!(s.title && s.body);
            const { title, body } = hasServerLabel
              ? { title: s.title, body: s.body }
              : labelFromEvent(event, s.data);

            const item: InboxItem = {
              id:        itemId,
              event,
              title,
              body,
              timestamp: new Date(s.createdAt).getTime(),
              read:      s.isRead,
              data:      s.data,
            };
            this._items.update(items => [item, ...items].slice(0, MAX_ITEMS));
          }
          this.saveToStorage();
        },
        error: () => { /* best-effort — silently ignore network errors */ },
      });
  }

  /**
   * Connect to chat WebSocket and listen for new messages globally.
   * Shows toast notifications when messages arrive.
   */
  private connectChatSocket(): void {
    console.log('🔌 NotificationInboxService: Connecting to chat socket');
    this.socketService.connect();
    console.log('🔌 Socket connected status:', this.socketService.isConnected());

    // Join salon room if user is a salon owner
    this.socketService.fromEvent<void>('connect')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        console.log('✅ Socket connected event received');
        const currentUser = this.authService.currentUser();
        console.log('👤 Current user on connect:', { sub: currentUser?.sub, role: currentUser?.role, email: currentUser?.email });
        if (currentUser?.role === 'salon_owner') {
          console.log('🏢 Joining salon room:', currentUser.sub);
          this.socketService.emit('join_salon_room', { salonId: currentUser.sub });
        }
      });

    // Listen for new chat messages
    console.log('🔔 NotificationInboxService: Setting up new_message listener');
    this.socketService.fromEvent<{ message: { _id?: string; senderId: string; senderName: string; body: string; conversationId: string; createdAt?: string } }>('new_message')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ message }) => {
        console.log('📨 NotificationInboxService: Received new_message event:', message);

        // Create unique message identifier for deduplication
        const messageId = message._id || `${message.conversationId}-${message.senderId}-${message.body}-${message.createdAt || Date.now()}`;

        // Check if we've already processed this message recently
        if (this.processedMessages.has(messageId)) {
          console.log('⏭️ Skipping notification: Duplicate message detected');
          return;
        }

        // Mark message as processed
        this.processedMessages.add(messageId);

        // Clean up old entries after TTL
        setTimeout(() => {
          this.processedMessages.delete(messageId);
        }, this.MESSAGE_DEDUP_TTL);

        const currentUser = this.authService.currentUser();
        console.log('👤 Current user:', { sub: currentUser?.sub, email: currentUser?.email });

        const isOwnMessage = currentUser && message.senderId === currentUser.sub;
        console.log('❓ Is own message?', isOwnMessage, '(senderId:', message.senderId, 'vs currentUser.sub:', currentUser?.sub, ')');

        // Don't show notification for own messages
        if (isOwnMessage) {
          console.log('⏭️ Skipping notification: Own message');
          return;
        }

        const activeConvId = this.activeChatService.activeConversationId();
        console.log('💬 Active conversation:', activeConvId, 'Message conversation:', message.conversationId);

        // Don't show notification if user is actively viewing this conversation
        if (this.activeChatService.isConversationActive(message.conversationId)) {
          console.log('⏭️ Skipping notification: User is viewing this conversation');
          return;
        }

        console.log('✅ Showing notification for message from:', message.senderName);

        // Add to inbox
        this.addItem('chat.new_message', {
          senderName: message.senderName,
          messageBody: message.body,
          conversationId: message.conversationId,
        });

        // Show toast notification (always show, even if on chat page but different conversation)
        this.messageService.add({
          severity: 'info',
          summary: `💬 ${message.senderName}`,
          detail: message.body.length > 60
            ? `${message.body.substring(0, 60)}...`
            : message.body,
          life: 5000,
          sticky: false,
        });

        console.log('🔊 Playing notification sound');
        // Play notification sound
        this.playNotificationSound();
      });
  }

  /**
   * Play notification sound when a new message arrives
   */
  private playNotificationSound(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Resume audio context if it's suspended (browser security restriction)
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {
          // Silently fail if user hasn't interacted with page yet
        });
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch {
      // Silently fail if audio is not supported
    }
  }
}

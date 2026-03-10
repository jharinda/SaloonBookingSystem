import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged } from 'rxjs';
import { HttpClient } from '@angular/common/http';

import { AuthService, RealtimeNotificationService } from '@org/shared-data-access';

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
    default:
      return { title: event, body: JSON.stringify(data) };
  }
}

@Injectable({ providedIn: 'root' })
export class NotificationInboxService {
  private readonly realtimeService = inject(RealtimeNotificationService);
  private readonly authService     = inject(AuthService);
  private readonly http            = inject(HttpClient);

  private readonly _items = signal<InboxItem[]>([]);

  /** Read-only view of the inbox (newest first). */
  readonly items = this._items.asReadonly();

  /** Number of unread notifications. */
  readonly unreadCount = computed(() => this._items().filter(i => !i.read).length);

  constructor() {
    // Load any persisted notifications for the current user on startup.
    this.loadFromStorage();

    // When the user logs in or out, reload the inbox for the correct user.
    toObservable(this.authService.isLoggedIn)
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((loggedIn) => {
        if (loggedIn) {
          this.loadFromStorage();
          // Fetch any notifications the user missed while offline.
          this.fetchServerInbox();
        } else {
          this._items.set([]);
        }
      });

    // Append every arriving SSE notification to the inbox.
    this.realtimeService.notifications$
      .pipe(takeUntilDestroyed())
      .subscribe(({ event, data }) => {
        this.addItem(event, data);
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
      .get<{ _id: string; event: string; data: Record<string, unknown>; createdAt: string }[]>(
        '/api/notifications/inbox',
      )
      .subscribe({
        next: (serverItems) => {
          // Add in reverse (oldest first) so the final order is newest-first.
          const reversed = [...serverItems].reverse();
          for (const s of reversed) {
            const { title, body } = labelFromEvent(s.event, s.data);
            const itemId = `srv-${s._id}`;
            if (this._items().some(i => i.id === itemId)) continue;

            const item: InboxItem = {
              id:        itemId,
              event:     s.event,
              title,
              body,
              timestamp: new Date(s.createdAt).getTime(),
              read:      false,
              data:      s.data,
            };
            this._items.update(items => [item, ...items].slice(0, MAX_ITEMS));
          }
          this.saveToStorage();
        },
        error: () => { /* best-effort — silently ignore network errors */ },
      });
  }
}

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  ViewChild,
  ViewChildren,
  QueryList,
} from '@angular/core';
import { Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { Button } from 'primeng/button';
import { Popover } from 'primeng/popover';
import { DialogModule } from 'primeng/dialog';
import { NgTemplateOutlet } from '@angular/common';

import { AuthService } from '@org/shared-data-access';
import { NotificationInboxService, InboxItem } from '../../core/services/notification-inbox.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Popover, DialogModule, NgTemplateOutlet],
  template: `
    @if (showBell()) {

      <!-- ── Bell trigger button ───────────────────────────────────────── -->
      <div class="relative inline-flex">
        <p-button
          icon="pi pi-bell"
          [text]="true"
          [rounded]="true"
          severity="secondary"
          size="small"
          aria-label="Notifications"
          (onClick)="toggle($event)"
        />

        @if (unreadCount() > 0) {
          <span
            class="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4.5 w-4.5 min-w-4.5
                   items-center justify-center rounded-full bg-red-500 text-[10px]
                   font-bold leading-none text-white px-0.5"
          >
            {{ unreadCount() > 99 ? '99+' : unreadCount() }}
          </span>
        }
      </div>

      <!-- ── Desktop Popover panel ─────────────────────────────────────── -->
      @if (!isMobile()) {
        <p-popover #op styleClass="notif-popover w-80">
          <ng-container [ngTemplateOutlet]="notifHeader" />
          <div class="overflow-y-auto max-h-80">
            <ng-container [ngTemplateOutlet]="notifList" />
          </div>
        </p-popover>
      }

      <!-- ── Mobile full-screen dialog ─────────────────────────────────── -->
      <p-dialog
        [visible]="mobileOpen()"
        (visibleChange)="closeMobile()"
        [modal]="true"
        [dismissableMask]="true"
        [closable]="true"
        [style]="{ width: '100vw', height: '100dvh', maxHeight: '100dvh', borderRadius: 0, margin: 0, top: 0, left: 0 }"
        styleClass="notif-fullscreen-dialog"
        [contentStyle]="{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }"
        header="Notifications"
      >
        <ng-container [ngTemplateOutlet]="notifHeader" />
        <div class="notif-scroll-list" #mobileScrollList>
          <ng-container [ngTemplateOutlet]="notifListMobile" />
        </div>
      </p-dialog>

      <!-- ── Shared templates ───────────────────────────────────────────── -->
      <ng-template #notifHeader>
        <div class="flex items-center justify-between px-3 pt-3 pb-2
                    border-b border-zinc-100 dark:border-zinc-700">
          <span class="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
            @if (unreadCount() > 0) {
              <span class="ml-1.5 inline-flex items-center justify-center
                           h-4 min-w-4 rounded-full bg-red-500 text-[10px]
                           font-bold text-white px-1">
                {{ unreadCount() }}
              </span>
            }
          </span>
          <div class="flex gap-1">
            @if (unreadCount() > 0) {
              <button
                type="button"
                class="text-xs text-violet-600 dark:text-violet-400
                       hover:underline focus:outline-none"
                (click)="inboxService.markAllRead()"
                aria-label="Mark all as read"
              >
                Mark all read
              </button>
            }
            @if (items().length > 0) {
              <span class="text-zinc-300 dark:text-zinc-600 mx-1">·</span>
              <button
                type="button"
                class="text-xs text-zinc-400 hover:text-red-500
                       dark:hover:text-red-400 focus:outline-none"
                (click)="inboxService.clearAll()"
                aria-label="Clear all notifications"
              >
                Clear
              </button>
            }
          </div>
        </div>
      </ng-template>

      <!-- Desktop list (inside popover) -->
      <ng-template #notifList>
        @if (items().length === 0) {
          <ng-container [ngTemplateOutlet]="emptyState" />
        }
        @for (item of items(); track item.id) {
          <div
            class="flex gap-3 px-3 py-2.5 cursor-pointer transition-colors
                   hover:bg-zinc-50 dark:hover:bg-zinc-800/60
                   border-b border-zinc-100 dark:border-zinc-700/50 last:border-0"
            [class.notif-unread]="!item.read"
            (click)="onNotificationClick(item)"
            tabindex="0"
            role="listitem"
          >
            <div class="flex-shrink-0 mt-1.5">
              @if (!item.read) {
                <span class="block w-2 h-2 rounded-full bg-violet-500"></span>
              } @else {
                <span class="block w-2 h-2 rounded-full bg-transparent"></span>
              }
            </div>
            <div class="flex-1 min-w-0">
              <p class="m-0 text-sm font-medium text-zinc-800 dark:text-zinc-100 leading-snug">
                {{ item.title }}
              </p>
              <p class="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {{ item.body }}
              </p>
              <p class="m-0 mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                {{ relativeTime(item.timestamp) }}
              </p>
            </div>
          </div>
        }
      </ng-template>

      <!-- Mobile list (inside full-screen dialog, items have data-id for IntersectionObserver) -->
      <ng-template #notifListMobile>
        @if (items().length === 0) {
          <ng-container [ngTemplateOutlet]="emptyState" />
        }
        @for (item of items(); track item.id) {
          <div
            class="flex gap-3 px-4 py-3 cursor-pointer transition-colors
                   border-b border-zinc-100 dark:border-zinc-700/50 last:border-0"
            [class.notif-unread]="!item.read"
            [attr.data-notif-id]="item.id"
            (click)="onNotificationClick(item); closeMobile()"
            tabindex="0"
            role="listitem"
          >
            <div class="flex-shrink-0 mt-1.5">
              @if (!item.read) {
                <span class="block w-2.5 h-2.5 rounded-full bg-violet-500"></span>
              } @else {
                <span class="block w-2.5 h-2.5 rounded-full bg-transparent"></span>
              }
            </div>
            <div class="flex-1 min-w-0">
              <p class="m-0 text-sm font-medium text-zinc-800 dark:text-zinc-100 leading-snug">
                {{ item.title }}
              </p>
              <p class="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {{ item.body }}
              </p>
              <p class="m-0 mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                {{ relativeTime(item.timestamp) }}
              </p>
            </div>
          </div>
        }
      </ng-template>

      <ng-template #emptyState>
        <div class="flex flex-col items-center justify-center py-10 gap-2
                    text-zinc-400 dark:text-zinc-500">
          <i class="pi pi-bell text-3xl opacity-40"></i>
          <p class="text-sm m-0">No notifications yet</p>
        </div>
      </ng-template>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; }

    :host ::ng-deep .notif-popover {
      padding: 0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    }

    :host ::ng-deep .notif-popover .p-popover-content {
      padding: 0;
    }

    /* Unread row highlight — light & dark */
    :host ::ng-deep .notif-unread {
      background-color: #f5f3ff;
    }
    :host-context(.dark) ::ng-deep .notif-unread {
      background-color: rgba(167, 139, 250, 0.08);
    }

    /* Full-screen dialog overrides */
    :host ::ng-deep .notif-fullscreen-dialog {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      margin: 0 !important;
      border-radius: 0 !important;
    }

    :host ::ng-deep .notif-fullscreen-dialog .p-dialog-content {
      padding: 0 !important;
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .notif-scroll-list {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
  `],
})
export class NotificationBellComponent implements OnDestroy {
  protected readonly inboxService     = inject(NotificationInboxService);
  private   readonly authService      = inject(AuthService);
  private   readonly router           = inject(Router);
  private   readonly breakpointObs    = inject(BreakpointObserver);

  @ViewChild('op') private readonly popover?: Popover;
  @ViewChild('mobileScrollList') private readonly scrollListEl?: ElementRef<HTMLElement>;

  readonly items        = this.inboxService.items;
  readonly unreadCount  = this.inboxService.unreadCount;

  readonly isMobile = toSignal(
    this.breakpointObs.observe('(max-width: 767px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly mobileOpen = signal(false);

  /** Show the bell for any logged-in user. */
  readonly showBell = computed(() => !!this.authService.currentUser()?.role);

  private _intersectionObserver?: IntersectionObserver;

  toggle(event: MouseEvent): void {
    if (this.isMobile()) {
      this.mobileOpen.set(true);
      // Set up IntersectionObserver after dialog renders
      setTimeout(() => this._setupScrollReadObserver(), 150);
    } else {
      this.popover?.toggle(event);
    }
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
    this._intersectionObserver?.disconnect();
    this._intersectionObserver = undefined;
  }

  /** Mark items as read when they scroll into view (mobile full-screen). */
  private _setupScrollReadObserver(): void {
    const container = this.scrollListEl?.nativeElement;
    if (!container) return;

    this._intersectionObserver?.disconnect();
    this._intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset['notifId'];
            if (id) this.inboxService.markRead(id);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );

    container.querySelectorAll<HTMLElement>('[data-notif-id]').forEach((el) => {
      this._intersectionObserver!.observe(el);
    });
  }

  ngOnDestroy(): void {
    this._intersectionObserver?.disconnect();
  }

  onNotificationClick(item: InboxItem): void {
    this.inboxService.markRead(item.id);
    this.popover?.hide();

    const d = (item.data ?? {}) as Record<string, string>;
    const bookingId = d['bookingId'];

    const role = this.authService.currentUser()?.role;
    const path = role === 'client' ? '/my-appointments' : '/salon-dashboard/appointments';
    void this.router.navigate([path], {
      queryParams: bookingId ? { bookingId } : {},
    });
  }

  relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const mins  = Math.floor(diff / 60_000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs} hr ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days} day${days > 1 ? 's' : ''} ago`;
    return new Date(ts).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }
}

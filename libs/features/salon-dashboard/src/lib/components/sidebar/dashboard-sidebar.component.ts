import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { RealtimeNotificationService } from '@org/shared-data-access';

interface BookingNewData {
  bookingId:       string;
  clientName:      string;
  serviceName:     string;
  startTime:       string;
  appointmentDate: string;
}

@Component({
  selector: 'lib-dashboard-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    Button,
    Tooltip,
  ],
  templateUrl: './dashboard-sidebar.component.html',
  styles: [`
    :host {
      display: block;
    }

    .nav-icon-btn {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      height: 2.5rem;
      border-radius: 10px;
      color: #52525b;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;

      i { font-size: 1.1rem; }

      &:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #18181b;
      }
    }

    :host-context(.app-dark) .nav-icon-btn {
      color: #71717a;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
    }

    :host ::ng-deep .active-nav-item {
      background: rgba(16, 185, 129, 0.15) !important;
      color: #10b981 !important;

      i { color: #10b981; }
    }

    @media (max-width: 768px) {
      aside { display: none; }
      main { margin-left: 0 !important; }
    }
  `],
})
export class DashboardSidebarComponent {
  private readonly realtimeNotif = inject(RealtimeNotificationService);
  private readonly messageService = inject(MessageService);
  private readonly router         = inject(Router);
  private readonly destroyRef     = inject(DestroyRef);

  readonly salonName   = input<string | null>(null);
  readonly userEmail   = input<string>('');
  readonly isExpanded  = input<boolean>(false);

  readonly expanded      = output<void>();
  readonly collapsed     = output<void>();
  readonly logoutClicked = output<void>();

  /** Count of unseen 'booking.new' events since last visit to the bookings page. */
  readonly newBookingsCount = signal(0);

  constructor() {
    // ── Listen for new bookings via SSE ──────────────────────────────────────
    this.realtimeNotif.notifications$
      .pipe(
        filter((n) => n.event === 'booking.new'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((n) => {
        const d = n.data as BookingNewData;

        this.messageService.add({
          severity: 'info',
          summary:  'New Booking!',
          detail:   `${d.clientName} booked ${d.serviceName} at ${d.startTime}`,
          life:     8000,
        });

        this.newBookingsCount.update((c) => c + 1);
      });

    // ── Reset badge when the user navigates to the bookings page ─────────────
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        filter((e) => (e as NavigationEnd).urlAfterRedirects.startsWith('/salon-dashboard/bookings')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.newBookingsCount.set(0));
  }

  logout(): void {
    this.logoutClicked.emit();
  }
}

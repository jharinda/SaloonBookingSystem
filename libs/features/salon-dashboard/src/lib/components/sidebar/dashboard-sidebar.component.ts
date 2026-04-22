import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { PlanFeatureService, RealtimeNotificationService } from '@org/shared-data-access';

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
    NgClass,
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

    /* ── Mobile bottom nav ───────────────────────────────────── */
    .mobile-bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 50;
      display: flex;
      align-items: stretch;
      background: #fff;
      border-top: 1px solid #e4e4e7;
      box-shadow: 0 -2px 12px rgba(0,0,0,0.08);
      height: 3.5rem;
      padding-bottom: env(safe-area-inset-bottom);
    }

    :host-context(.app-dark) .mobile-bottom-nav {
      background: #09090b;
      border-top-color: #3f3f46;
    }

    .mobile-nav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      text-decoration: none;
      color: #71717a;
      font-size: 0.625rem;
      font-weight: 500;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      transition: color 0.15s;

      i { font-size: 1.2rem; }

      &:hover, &:focus { color: #10b981; outline: none; }
    }

    :host ::ng-deep .mobile-nav-active.mobile-nav-item,
    :host ::ng-deep a.mobile-nav-item.active-nav-item {
      color: #10b981;
    }

    .mobile-nav-badge {
      position: absolute;
      top: -4px;
      right: -6px;
      min-width: 1rem;
      height: 1rem;
      padding: 0 2px;
      border-radius: 999px;
      background: #10b981;
      color: #fff;
      font-size: 0.55rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    /* ── More overlay ────────────────────────────────────────── */
    .mobile-more-overlay {
      position: fixed;
      inset: 0;
      z-index: 49;
      background: rgba(0,0,0,0.3);
      backdrop-filter: blur(2px);
    }

    .mobile-more-menu {
      position: absolute;
      bottom: 3.5rem;
      left: 0;
      right: 0;
      background: #fff;
      border-top: 1px solid #e4e4e7;
      border-radius: 16px 16px 0 0;
      padding: 0.75rem 0 0.5rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
    }

    :host-context(.app-dark) .mobile-more-menu {
      background: #18181b;
      border-top-color: #3f3f46;
    }

    .mobile-more-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 0.75rem 0.5rem;
      color: #52525b;
      text-decoration: none;
      font-size: 0.7rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      background: none;
      transition: color 0.15s;

      i { font-size: 1.25rem; }
      &:hover { color: #10b981; }
    }

    :host-context(.app-dark) .mobile-more-item { color: #a1a1aa; }

    @media (max-width: 767px) {
      aside { display: none !important; }
    }
  `],
})
export class DashboardSidebarComponent {
  private readonly realtimeNotif       = inject(RealtimeNotificationService);
  private readonly messageService      = inject(MessageService);
  private readonly router              = inject(Router);
  private readonly destroyRef          = inject(DestroyRef);
  private readonly breakpointObserver  = inject(BreakpointObserver);
  readonly planFeature                 = inject(PlanFeatureService);

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 767px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly moreOpen = signal(false);

  toggleMore(): void { this.moreOpen.update((v) => !v); }

  readonly hasAnalytics    = computed(() => this.planFeature.hasFeature('analytics'));
  readonly analyticsUpgradeMsg = computed(() =>
    !this.hasAnalytics()
      ? `Upgrade to ${this.planFeature.requiredPlanFor('analytics')} plan to unlock Analytics`
      : 'Analytics'
  );

  readonly salonName   = input<string | null>(null);
  /** True once dashboard finished loading the owner's salon (or confirmed none). */
  readonly salonContextReady = input(false);
  /** True when GET /api/salons/owner/me returned at least one salon. */
  readonly hasSalon    = input(false);
  readonly userEmail   = input<string>('');
  readonly isExpanded  = input<boolean>(false);
  /** Show Franchise nav link (franchise_owner only). */
  readonly showFranchise = input<boolean>(false);

  /**
   * When true, salon-dependent routes would error — show only "Register salon" until
   * {@link hasSalon} is true. While {@link salonContextReady} is false, keep full nav to avoid a flash during load.
   */
  readonly showRestrictedNav = computed(
    () => this.salonContextReady() && !this.hasSalon(),
  );

  readonly expanded      = output<void>();
  readonly collapsed     = output<void>();
  readonly logoutClicked = output<void>();

  /** Count of unseen 'booking.new' events since last visit to the bookings page. */
  readonly newBookingsCount = signal(0);

  constructor() {
    // Load plan features once for the session
    this.planFeature.load();

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
        filter((e) =>
          (e as NavigationEnd).urlAfterRedirects.startsWith('/salon-dashboard/appointments'),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.newBookingsCount.set(0));
  }

  logout(): void {
    this.logoutClicked.emit();
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService, SalonAdminService } from '@org/shared-data-access';
import { Salon } from '@org/models';

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Bookings',     icon: 'calendar_today',  path: 'bookings' },
  { label: 'Services',     icon: 'content_cut',     path: 'services' },
  { label: 'Hours',        icon: 'schedule',        path: 'hours' },
  { label: 'Reviews',      icon: 'star_rate',       path: 'reviews' },
];

@Component({
  selector: 'lib-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="dashboard-layout">

      <!-- ── Sidebar ──────────────────────────────────────────── -->
      <aside class="dashboard-sidebar">
        <div class="sidebar-header">
          <mat-icon class="sidebar-logo">content_cut</mat-icon>
          <div class="sidebar-brand">
            <span class="sidebar-brand-name">SnapSalon</span>
            <span class="sidebar-brand-tagline">Owner Portal</span>
          </div>
        </div>

        @if (salon()) {
          <div class="sidebar-salon">
            <div class="sidebar-salon-name">{{ salon()!.name }}</div>
            <div class="sidebar-salon-city">{{ salon()!.address.city }}</div>
          </div>
        }

        <nav class="sidebar-nav" aria-label="Dashboard navigation">
          @for (item of navItems; track item.path) {
            <a
              class="nav-item"
              [routerLink]="item.path"
              routerLinkActive="nav-item--active"
              [routerLinkActiveOptions]="{ exact: false }"
            >
              <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-user">
            <mat-icon>account_circle</mat-icon>
            <span class="sidebar-user-email">{{ userEmail() }}</span>
          </div>
          <button mat-icon-button (click)="logout()" matTooltip="Sign out" aria-label="Sign out">
            <mat-icon>logout</mat-icon>
          </button>
        </div>
      </aside>

      <!-- ── Mobile nav bar ──────────────────────────────────── -->
      <nav class="mobile-nav" aria-label="Dashboard navigation">
        @for (item of navItems; track item.path) {
          <a
            class="mobile-nav-item"
            [routerLink]="item.path"
            routerLinkActive="mobile-nav-item--active"
          >
            <mat-icon>{{ item.icon }}</mat-icon>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>

      <!-- ── Main content ─────────────────────────────────────── -->
      <main class="dashboard-main">
        @if (isLoading()) {
          <div class="page-loading">
            <mat-spinner diameter="40" />
            <span>Loading your dashboard…</span>
          </div>
        } @else if (loadError()) {
          <div class="page-error">
            <mat-icon color="warn">error_outline</mat-icon>
            <p>{{ loadError() }}</p>
            <button mat-raised-button color="primary" (click)="loadSalon()">
              Retry
            </button>
          </div>
        } @else if (!isOwner()) {
          <div class="page-error">
            <mat-icon color="warn">lock</mat-icon>
            <p>You do not have salon-owner access.</p>
          </div>
        } @else {
          <router-outlet />
        }
      </main>

    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; }

    .dashboard-layout {
      display: grid;
      grid-template-columns: 240px 1fr;
      grid-template-rows: 1fr auto;
      height: 100vh;
      overflow: hidden;
    }

    /* ── Sidebar ── */
    .dashboard-sidebar {
      grid-column: 1;
      grid-row: 1 / 3;
      background: #1a1a2e;
      color: #e5e7eb;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 18px 16px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .sidebar-logo { color: #a78bfa; font-size: 1.6rem; width: 1.6rem; height: 1.6rem; }

    .sidebar-brand-name {
      font-weight: 700;
      font-size: 1.05rem;
      color: #fff;
      display: block;
    }

    .sidebar-brand-tagline {
      font-size: 0.7rem;
      color: #a78bfa;
      text-transform: uppercase;
      letter-spacing: .05em;
    }

    .sidebar-salon {
      padding: 12px 18px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .sidebar-salon-name { font-weight: 600; font-size: .9rem; color: #fff; }
    .sidebar-salon-city { font-size: .75rem; color: #9ca3af; margin-top: 2px; }

    .sidebar-nav {
      flex: 1;
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      color: #d1d5db;
      text-decoration: none;
      font-size: .9rem;
      transition: background .15s, color .15s;

      &:hover { background: rgba(255,255,255,.07); color: #fff; }
    }

    .nav-item--active {
      background: rgba(167,139,250,.18);
      color: #a78bfa;
    }

    .nav-icon { font-size: 1.1rem; width: 1.1rem; height: 1.1rem; }

    .sidebar-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-top: 1px solid rgba(255,255,255,.08);
      gap: 8px;
    }

    .sidebar-user {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: #9ca3af;
      font-size: .75rem;
    }

    .sidebar-user-email {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Mobile nav ── */
    .mobile-nav {
      display: none;
      grid-column: 1 / 3;
      grid-row: 2;
      background: #1a1a2e;
      border-top: 1px solid rgba(255,255,255,.08);
    }

    .mobile-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      color: #9ca3af;
      text-decoration: none;
      flex: 1;
      padding: 8px 4px;
      font-size: .6rem;
    }

    .mobile-nav-item mat-icon { font-size: 1.2rem; width: 1.2rem; height: 1.2rem; }
    .mobile-nav-item--active { color: #a78bfa; }

    /* ── Main ── */
    .dashboard-main {
      grid-column: 2;
      grid-row: 1;
      overflow-y: auto;
      background: #f9fafb;
      padding: 32px 36px;
    }

    .page-loading, .page-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      height: 60vh;
      color: #6b7280;
      text-align: center;
    }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .dashboard-layout {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr auto;
      }

      .dashboard-sidebar { display: none; }
      .mobile-nav { display: flex; }
      .dashboard-main { grid-column: 1; padding: 20px 16px 24px; }
    }
  `],
})
export class DashboardHomeComponent implements OnInit {
  private readonly authService  = inject(AuthService);
  private readonly adminService = inject(SalonAdminService);
  private readonly router       = inject(Router);

  readonly navItems = NAV_ITEMS;

  readonly salon     = signal<Salon | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly isOwner  = computed(() => this.authService.getUserRole() === 'salon_owner');
  readonly userEmail = computed(() => this.authService.currentUser()?.email ?? '');

  ngOnInit(): void {
    if (!this.isOwner()) {
      this.isLoading.set(false);
      return;
    }
    this.loadSalon();
  }

  loadSalon(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.adminService.getOwnSalon().subscribe({
      next: (s) => { this.salon.set(s); this.isLoading.set(false); },
      error: (err: HttpErrorResponse) => {
        // 404 = no salon registered yet — redirect to the register wizard
        if (err.status === 404) {
          this.isLoading.set(false);
          void this.router.navigate(['/salon-dashboard', 'register']);
          return;
        }
        this.loadError.set('Could not load your salon. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => void this.router.navigate(['/auth', 'login']),
      error:    () => void this.router.navigate(['/auth', 'login']),
    });
  }
}

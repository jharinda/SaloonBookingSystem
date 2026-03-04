import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterOutlet } from '@angular/router';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Button } from 'primeng/button';
import { MenuItem } from 'primeng/api';
import { PanelMenu } from 'primeng/panelmenu';

import { AuthService, SalonAdminService } from '@org/shared-data-access';
import { Salon } from '@org/models';

@Component({
  selector: 'lib-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    ProgressSpinner,
    Button,
    PanelMenu,
  ],
  templateUrl: './dashboard-home.component.html',
  styles: [`
    :host { display: block; }

    /* â”€â”€ PanelMenu dark-sidebar overrides â”€â”€ */
    :host ::ng-deep .dashboard-panelmenu {
      .p-panelmenu-panel {
        margin-bottom: 2px;
        border: none;
        background: transparent;
      }

      .p-panelmenu-header {
        background: transparent;
        border: none;
        border-radius: 8px;
        color: #d1d5db;

        &:hover { background: rgba(255,255,255,0.07); }

        &.p-highlight { background: rgba(167,139,250,0.18); color: #a78bfa; }

        .p-panelmenu-header-content {
          background: transparent;
          border: none;
          padding: 0.6rem 0.75rem;
          color: inherit;
          font-size: 0.9rem;
          border-radius: 8px;
        }

        .p-panelmenu-header-icon { margin-right: 0.5rem; }

        /* Hide the expand toggle arrow for leaf items */
        .p-panelmenu-header-toggle-icon { display: none; }
      }

      .p-panelmenu-content {
        background: transparent;
        border: none;
        padding: 0;
      }

      .p-menuitem-link {
        padding: 0.5rem 0.75rem 0.5rem 2rem;
        color: #9ca3af;
        border-radius: 6px;
        font-size: 0.85rem;

        &:hover { background: rgba(255,255,255,0.07); color: #fff; }
        &.p-menuitem-link-active { color: #a78bfa; }
      }
    }

    @media (max-width: 768px) {
      aside { display: none; }
    }
  `],
})
export class DashboardHomeComponent implements OnInit {
  private readonly authService  = inject(AuthService);
  private readonly adminService = inject(SalonAdminService);
  private readonly router       = inject(Router);

  readonly salon     = signal<Salon | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly isOwner   = computed(() => this.authService.getUserRole() === 'salon_owner');
  readonly userEmail = computed(() => this.authService.currentUser()?.email ?? '');

  readonly panelMenuItems: MenuItem[] = [
    {
      label: 'Overview',
      icon: 'pi pi-home',
      routerLink: '/salon-dashboard/overview',
    },
    {
      label: 'Appointments',
      icon: 'pi pi-calendar',
      routerLink: '/salon-dashboard/bookings',
    },
    {
      label: 'Services',
      icon: 'pi pi-wrench',
      routerLink: '/salon-dashboard/services',
    },
    {
      label: 'Staff',
      icon: 'pi pi-users',
      routerLink: '/salon-dashboard/staff',
    },
    {
      label: 'Working Hours',
      icon: 'pi pi-clock',
      routerLink: '/salon-dashboard/hours',
    },
    {
      label: 'Reviews',
      icon: 'pi pi-star',
      routerLink: '/salon-dashboard/reviews',
    },
    {
      label: 'Settings',
      icon: 'pi pi-cog',
      routerLink: '/salon-dashboard/settings',
    },
  ];

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


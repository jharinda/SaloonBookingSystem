import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { MenuItem } from 'primeng/api';
import { PanelMenu } from 'primeng/panelmenu';
import { Avatar } from 'primeng/avatar';

import { AuthService, SalonAdminService } from '@org/shared-data-access';
import { Salon } from '@org/models';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    PanelMenu,
    Avatar,
  ],
  templateUrl: './dashboard-layout.component.html',
  styles: [`
    :host { display: block; }

    /* ── PanelMenu light/dark override ── */
    :host ::ng-deep .dash-panelmenu {

      .p-panelmenu-panel {
        border: none;
        background: transparent;
        margin-bottom: 2px;
      }

      .p-panelmenu-header {
        background: transparent;
        border: none;
        border-radius: 8px;

        &:hover .p-panelmenu-header-content {
          background: #f4f4f5; /* zinc-100 */
        }

        .p-panelmenu-header-content {
          background: transparent;
          border: none;
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          font-size: 0.9rem;
          color: #3f3f46; /* zinc-700 */
          transition: background 0.15s;
        }

        /* Hide expand arrow — all items are leaf links */
        .p-panelmenu-header-toggle-icon { display: none; }
      }

      /* Active / router-link-active tint */
      .p-menuitem-link-active .p-panelmenu-header-content,
      .p-panelmenu-header.p-highlight .p-panelmenu-header-content {
        background: #ede9fe; /* violet-100 */
        color: #7c3aed;      /* violet-600 */
        font-weight: 600;
      }

      .p-panelmenu-content {
        background: transparent;
        border: none;
        padding: 0;
      }
    }

    /* Dark mode overrides */
    :host-context(.dark) ::ng-deep .dash-panelmenu {
      .p-panelmenu-header-content { color: #d4d4d8; }

      .p-panelmenu-header:hover .p-panelmenu-header-content {
        background: rgba(255,255,255,0.07);
      }

      .p-menuitem-link-active .p-panelmenu-header-content,
      .p-panelmenu-header.p-highlight .p-panelmenu-header-content {
        background: rgba(167,139,250,0.18);
        color: #a78bfa;
      }
    }
  `],
})
export class DashboardLayoutComponent implements OnInit {
  private readonly salonAdminService = inject(SalonAdminService);
  private readonly authService       = inject(AuthService);

  // ── State ─────────────────────────────────────────────────────────────────────
  readonly salon      = signal<Salon | null>(null);
  readonly isLoading  = signal(true);
  readonly loadError  = signal<string | null>(null);

  /** First letter of the salon name, used as the avatar label fallback */
  readonly avatarLabel = computed<string>(() => {
    const name = this.salon()?.name;
    return name ? name.charAt(0).toUpperCase() : '?';
  });

  /** Resolved URL to the salon's primary image (for avatar image mode) */
  readonly avatarImage = computed<string | undefined>(() => {
    const img = this.salon()?.images?.[0];
    return img?.url ?? undefined;
  });

  // ── Menu model ────────────────────────────────────────────────────────────────
  readonly menuItems: MenuItem[] = [
    {
      label: 'Overview',
      icon: 'pi pi-home',
      routerLink: ['/dashboard'],
    },
    {
      label: 'Appointments',
      icon: 'pi pi-calendar',
      routerLink: ['/dashboard/appointments'],
    },
    {
      label: 'Services',
      icon: 'pi pi-tag',
      routerLink: ['/dashboard/services'],
    },
    {
      label: 'Staff',
      icon: 'pi pi-users',
      routerLink: ['/dashboard/staff'],
    },
    {
      label: 'Analytics',
      icon: 'pi pi-chart-bar',
      routerLink: ['/dashboard/analytics'],
    },
    {
      label: 'Settings',
      icon: 'pi pi-cog',
      routerLink: ['/dashboard/settings'],
    },
  ];

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadSalon();
  }

  loadSalon(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.salonAdminService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salon.set(salon);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load salon details.');
        this.isLoading.set(false);
      },
    });
  }

  // ── Auth helpers ──────────────────────────────────────────────────────────────
  get userDisplayName(): string {
    const u = this.authService.currentUser();
    if (!u) return '';
    return u.email;
  }

  get userInitial(): string {
    return this.userDisplayName.charAt(0).toUpperCase() || '?';
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';

import { AdminService, AuthService } from '@org/shared-data-access';

interface NavItem {
  label:    string;
  icon:     string;
  route:    string;
  badgeKey?: 'pendingApproval';
}

@Component({
  selector: 'lib-admin-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Button,
    Tooltip,
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl:    './admin-layout.component.scss',
})
export class AdminLayoutComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly authService  = inject(AuthService);
  private readonly router       = inject(Router);

  readonly pendingCount = signal(0);
  readonly isExpanded   = signal(false);

  readonly userEmail = computed(() => this.authService.currentUser()?.email ?? '');

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',       icon: 'pi-chart-pie',    route: '/admin/dashboard' },
    { label: 'Salon Approvals', icon: 'pi-check-circle', route: '/admin/approvals', badgeKey: 'pendingApproval' },
    { label: 'All Salons',      icon: 'pi-shop',         route: '/admin/salons' },
    { label: 'Users',           icon: 'pi-users',        route: '/admin/users' },
    { label: 'Reviews',         icon: 'pi-star',         route: '/admin/reviews' },
    { label: 'Specialties',     icon: 'pi-tags',         route: '/admin/specialties' },
  ];

  ngOnInit(): void {
    this.adminService.getStats().subscribe({
      next:  (s) => this.pendingCount.set(s.pendingApproval),
      error: () => { /* non-critical */ },
    });
  }

  getBadge(item: NavItem): number | null {
    if (item.badgeKey === 'pendingApproval') {
      return this.pendingCount() > 0 ? this.pendingCount() : null;
    }
    return null;
  }

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => void this.router.navigate(['/discover']),
      error:    () => void this.router.navigate(['/discover']),
    });
  }
}

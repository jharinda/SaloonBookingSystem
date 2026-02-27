import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminService } from '@org/shared-data-access';

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
    MatBadgeModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl:    './admin-layout.component.scss',
})
export class AdminLayoutComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly router       = inject(Router);

  readonly pendingCount = signal(0);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',       icon: 'dashboard',       route: '/admin/dashboard' },
    { label: 'Salon Approvals', icon: 'approval',        route: '/admin/approvals', badgeKey: 'pendingApproval' },
    { label: 'All Salons',      icon: 'storefront',      route: '/admin/salons' },
    { label: 'Users',           icon: 'group',           route: '/admin/users' },
    { label: 'Reviews',         icon: 'rate_review',     route: '/admin/reviews' },
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
}

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AdminService, AdminStats } from '@org/shared-data-access';

interface StatCard {
  key:    keyof AdminStats;
  label:  string;
  icon:   string;
  prefix?: string;
  suffix?: string;
}

@Component({
  selector: 'lib-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl:    './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);
  readonly stats   = signal<AdminStats | null>(null);

  readonly cards: StatCard[] = [
    { key: 'totalSalons',     label: 'Total Salons',       icon: 'storefront' },
    { key: 'pendingApproval', label: 'Pending Approval',   icon: 'pending_actions' },
    { key: 'totalClients',    label: 'Total Clients',      icon: 'group' },
    { key: 'bookingsToday',   label: 'Bookings Today',     icon: 'event_available' },
    { key: 'monthlyRevenue',  label: 'Monthly Revenue',    icon: 'payments', prefix: 'LKR ' },
  ];

  ngOnInit(): void {
    this.loadStats();
  }

  protected loadStats(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService.getStats().subscribe({
      next:  (s)  => { this.stats.set(s); this.loading.set(false); },
      error: ()   => { this.error.set('Failed to load statistics'); this.loading.set(false); },
    });
  }

  getStatValue(key: keyof AdminStats): number {
    const s = this.stats();
    if (!s) return 0;
    const v = s[key];
    return typeof v === 'number' ? v : 0;
  }

  getTrend(key: keyof AdminStats): number | null {
    const trends = this.stats()?.trends;
    if (!trends) return null;
    const tKey = key as keyof NonNullable<AdminStats['trends']>;
    return (trends[tKey] as number | undefined) ?? null;
  }
}

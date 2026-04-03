import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Button } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ChartModule } from 'primeng/chart';

import {
  AdminService,
  AdminStats,
  SubscriptionDistribution,
  CurrencyService,
  AppCurrencyPipe,
} from '@org/shared-data-access';

interface StatCard {
  key:    keyof AdminStats;
  label:  string;
  icon:   string;
  prefix?: string;
  suffix?: string;
}

interface RevenueRow {
  rank:      number;
  salonName: string;
  revenue:   number;
}

@Component({
  selector: 'lib-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, ProgressSpinner, Button, TableModule, ChartModule, AppCurrencyPipe],
  templateUrl: './admin-dashboard.component.html',
  styleUrl:    './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly currencyService = inject(CurrencyService);

  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);
  readonly stats   = signal<AdminStats | null>(null);
  readonly subscriptionDist = signal<SubscriptionDistribution | null>(null);
  readonly chartData   = signal<object | null>(null);
  readonly chartOptions = signal<object>({});

  readonly cards: StatCard[] = [
    { key: 'totalSalons',     label: 'Total Salons',       icon: 'storefront' },
    { key: 'pendingApproval', label: 'Pending Approval',   icon: 'pending_actions' },
    { key: 'totalClients',    label: 'Total Clients',      icon: 'group' },
    { key: 'bookingsToday',   label: 'Bookings Today',     icon: 'event_available' },
    { key: 'monthlyRevenue',  label: 'Monthly Revenue',    icon: 'payments', prefix: '' },
  ];

  ngOnInit(): void {
    this.loadStats();
  }

  protected loadStats(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService.getStats().subscribe({
      next:  (s)  => {
        this.stats.set(s);
        this.loading.set(false);
      },
      error: ()   => { this.error.set('Failed to load statistics'); this.loading.set(false); },
    });

    this.adminService.getSubscriptionDistribution().subscribe({
      next: (dist) => {
        this.subscriptionDist.set(dist);
        this.chartData.set(this.buildChartData(dist));
        this.chartOptions.set(this.buildChartOptions());
      },
      error: () => { /* non-fatal: chart stays hidden */ },
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

  get revenueRows(): RevenueRow[] {
    return (this.stats()?.revenueBySalon ?? []).map((r, i) => ({
      rank:      i + 1,
      salonName: r.salonName || r.salonId,
      revenue:   r.revenue,
    }));
  }

  get completionRate(): number {
    return this.stats()?.completionRate ?? 0;
  }

  private buildChartData(dist: SubscriptionDistribution): object {
    const planLabels = ['Trial', 'Starter', 'Basic', 'Pro', 'Franchise'];
    const planColors = ['#94a3b8', '#6366f1', '#22c55e', '#f59e0b', '#8b5cf6'];
    return {
      labels: planLabels,
      datasets: [{
        data: [dist.trial, dist.starter, dist.basic, dist.pro, dist.franchise],
        backgroundColor: planColors,
        hoverBackgroundColor: planColors.map(c => c + 'cc'),
      }],
    };
  }

  private buildChartOptions(): object {
    return {
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 12 }, padding: 16 },
        },
      },
      responsive: true,
      maintainAspectRatio: false,
    };
  }
}

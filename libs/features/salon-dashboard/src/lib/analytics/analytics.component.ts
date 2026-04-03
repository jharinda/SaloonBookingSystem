import {
  Component,
  OnInit,
  signal,
  inject,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Chart,
  ChartConfiguration,
  ChartType,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  BarController,
  LineController,
  DoughnutController,
  Tooltip,
  Legend,
  Title,
  Filler,
} from 'chart.js';

import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { ProgressSpinner } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';

import {
  AnalyticsService,
  CurrencyService,
  PlanFeatureService,
  SalonAdminService,
  StaffAnalyticsItem,
} from '@org/shared-data-access';

Chart.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, BarController, LineController, DoughnutController,
  Tooltip, Legend, Title, Filler
);

interface RevenueData {
  date: string;
  revenue: number;
}

interface StaffPerformance {
  staffId: string;
  staffName: string;
  totalBookings: number;
  totalRevenue: number;
  rating: number;
  completionRate: number;
}

interface BookingStats {
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

@Component({
  selector: 'lib-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    Card,
    Button,
    DatePicker,
    ProgressSpinner,
    TooltipModule,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss'
})
export class AnalyticsComponent implements OnInit, AfterViewInit {
  private readonly salonService = inject(SalonAdminService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly currency = inject(CurrencyService);
  private readonly planFeature = inject(PlanFeatureService);

  readonly isLocked    = computed(() => !this.planFeature.hasFeature('analytics'));
  readonly requiredPlan = computed(() => this.planFeature.requiredPlanFor('analytics'));

  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('bookingStatusChart') bookingStatusChartRef!: ElementRef<HTMLCanvasElement>;

  private revenueChart?: Chart;
  private bookingStatusChart?: Chart;

  readonly salonId = signal<string | null>(null);

  /** PrimeNG range: [start, end]; default last 30 days */
  readonly dateRange = signal<Date[] | null>(this.defaultLast30DaysRange());

  readonly periodLabel = computed(() => {
    const r = this.dateRange();
    if (!r?.[0] || !r[1]) return 'Selected period';
    return `${this.fmtDate(r[0])} – ${this.fmtDate(r[1])}`;
  });

  revenueData = signal<RevenueData[]>([]);
  staffPerformance = signal<StaffPerformance[]>([]);
  bookingStats = signal<BookingStats>({
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0
  });

  totalRevenue = signal(0);
  totalBookings = signal(0);
  averageRating = signal(0);

  /** Booking-service analytics: revenue + status charts + headline totals */
  salonMetricsLoading = signal(false);
  salonMetricsError = signal<string | null>(null);

  /** Salon-service staff-analytics */
  staffLoading = signal(false);
  staffError = signal<string | null>(null);

  ngOnInit(): void {
    if (this.isLocked()) return;
    this.salonService.getDashboardSalon().subscribe({
      next: (salon) => {
        this.salonId.set(salon._id as string);
        this.loadSalonMetrics();
        this.loadStaffPerformance();
      },
      error: () => {
        this.salonMetricsError.set('Could not load your salon profile.');
      },
    });
  }

  ngAfterViewInit(): void {
    this.initializeCharts();
  }

  onDateRangeChange(value: Date[] | null): void {
    this.dateRange.set(value);
    if (!value?.[0] || !value[1] || this.isLocked()) return;
    if (!this.salonId()) return;
    this.loadSalonMetrics();
  }

  loadSalonMetrics(): void {
    const id = this.salonId();
    const range = this.dateRange();
    if (!id || !range?.[0] || !range[1]) return;

    this.salonMetricsLoading.set(true);
    this.salonMetricsError.set(null);

    const from = this.fmtDate(range[0]);
    const to = this.fmtDate(range[1]);

    this.analyticsService.getSalonAnalytics(id, from, to).subscribe({
      next: (res) => {
        this.revenueData.set(
          res.dailyRevenue.map((d) => ({ date: d.date, revenue: d.revenue })),
        );
        this.bookingStats.set({
          pending: res.statusBreakdown.pending,
          confirmed: res.statusBreakdown.confirmed,
          completed: res.statusBreakdown.completed,
          cancelled: res.statusBreakdown.cancelled,
          noShow: res.statusBreakdown.noShow,
        });
        this.totalRevenue.set(res.totalRevenue);
        this.totalBookings.set(res.totalBookings);
        this.salonMetricsLoading.set(false);

        if (this.revenueChart) {
          this.updateRevenueChart();
        }
        if (this.bookingStatusChart) {
          this.updateBookingStatusChart();
        }
      },
      error: (err: HttpErrorResponse) => {
        const msg =
          (err.error as { message?: string })?.message ??
          err.message ??
          'Failed to load booking analytics';
        this.salonMetricsError.set(msg);
        this.salonMetricsLoading.set(false);
      },
    });
  }

  loadStaffPerformance(): void {
    const id = this.salonId();
    if (!id) return;

    this.staffLoading.set(true);
    this.staffError.set(null);

    this.salonService.getStaffAnalytics(id).subscribe({
      next: (res) => {
        const rows = res.staff.map((s) => this.mapStaffToPerformance(s));
        this.staffPerformance.set(rows);
        const avg = rows.length
          ? rows.reduce((sum, s) => sum + s.rating, 0) / rows.length
          : 0;
        this.averageRating.set(avg);
        this.staffLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        const msg =
          (err.error as { message?: string })?.message ??
          err.message ??
          'Failed to load staff analytics';
        this.staffError.set(msg);
        this.staffPerformance.set([]);
        this.averageRating.set(0);
        this.staffLoading.set(false);
      },
    });
  }

  private mapStaffToPerformance(s: StaffAnalyticsItem): StaffPerformance {
    const total = s.totalAppointments;
    const completionRate =
      total > 0 ? Math.round((s.completedAppointments / total) * 100) : 0;
    return {
      staffId: s.stylistId,
      staffName: s.name,
      totalBookings: total,
      totalRevenue: s.revenueGenerated,
      rating: s.averageRating,
      completionRate,
    };
  }

  private defaultLast30DaysRange(): Date[] {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return [start, end];
  }

  private fmtDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  initializeCharts(): void {
    this.createRevenueChart();
    this.createBookingStatusChart();
  }

  createRevenueChart(): void {
    const data = this.revenueData();

    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        labels: data.map(d => new Date(d.date + 'T12:00:00.000Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
        datasets: [{
          label: `Revenue (${this.currency.currencySymbol()})`,
          data: data.map(d => d.revenue),
          borderColor: '#2196f3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `Revenue: ${this.currency.format(context.parsed.y ?? 0)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => {
                return this.currency.format(value as number);
              }
            }
          }
        }
      }
    };

    this.revenueChart = new Chart(this.revenueChartRef.nativeElement, config);
  }

  createBookingStatusChart(): void {
    const stats = this.bookingStats();

    const config: ChartConfiguration = {
      type: 'doughnut' as ChartType,
      data: {
        labels: ['Completed', 'Confirmed', 'Pending', 'Cancelled', 'No-Show'],
        datasets: [{
          data: [stats.completed, stats.confirmed, stats.pending, stats.cancelled, stats.noShow],
          backgroundColor: [
            '#4caf50',
            '#2196f3',
            '#ff9800',
            '#f44336',
            '#9e9e9e'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed;
                const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                return `${label}: ${value} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    this.bookingStatusChart = new Chart(this.bookingStatusChartRef.nativeElement, config);
  }

  updateRevenueChart(): void {
    if (!this.revenueChart) return;

    const data = this.revenueData();
    this.revenueChart.data.labels = data.map(d =>
      new Date(d.date + 'T12:00:00.000Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );
    this.revenueChart.data.datasets[0].data = data.map(d => d.revenue);
    this.revenueChart.update();
  }

  updateBookingStatusChart(): void {
    if (!this.bookingStatusChart) return;

    const stats = this.bookingStats();
    this.bookingStatusChart.data.datasets[0].data = [
      stats.completed,
      stats.confirmed,
      stats.pending,
      stats.cancelled,
      stats.noShow
    ];
    this.bookingStatusChart.update();
  }

  formatCurrency(value: number): string {
    return this.currency.format(value);
  }

  getTopPerformer(): StaffPerformance | null {
    const staff = this.staffPerformance();
    if (staff.length === 0) return null;

    return staff.reduce((top, current) =>
      current.totalRevenue > top.totalRevenue ? current : top
    );
  }
}

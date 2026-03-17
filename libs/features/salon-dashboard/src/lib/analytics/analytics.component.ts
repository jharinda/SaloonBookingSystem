import { Component, OnInit, signal, inject, ViewChild, ElementRef, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SalonAdminService, CurrencyService } from '@org/shared-data-access';

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
    Card,
    Button,
    Toast
  ],
  providers: [MessageService],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss'
})
export class AnalyticsComponent implements OnInit, AfterViewInit {
  private readonly salonService = inject(SalonAdminService);
  private readonly messageService = inject(MessageService);
  private readonly currency = inject(CurrencyService);

  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('bookingStatusChart') bookingStatusChartRef!: ElementRef<HTMLCanvasElement>;

  private revenueChart?: Chart;
  private bookingStatusChart?: Chart;

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
  loading = signal(false);

  ngOnInit(): void {
    this.loadAnalytics();
  }

  ngAfterViewInit(): void {
    this.initializeCharts();
  }

  async loadAnalytics(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.loadRevenueData(),
        this.loadStaffPerformance(),
        this.loadBookingStats()
      ]);
    } catch (error) {
      console.error('Error loading analytics:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load analytics data'
      });
    } finally {
      this.loading.set(false);
    }
  }

  async loadRevenueData(): Promise<void> {
    // Mock data - replace with actual API call
    const mockData: RevenueData[] = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      mockData.push({
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        revenue: Math.floor(Math.random() * 50000) + 20000
      });
    }

    this.revenueData.set(mockData);

    const total = mockData.reduce((sum, d) => sum + d.revenue, 0);
    this.totalRevenue.set(total);

    if (this.revenueChart) {
      this.updateRevenueChart();
    }
  }

  async loadStaffPerformance(): Promise<void> {
    // Mock data - replace with actual API call
    // Try to use: GET /api/salons/:id/staff-analytics
    const mockData: StaffPerformance[] = [
      {
        staffId: '1',
        staffName: 'Emma Wilson',
        totalBookings: 145,
        totalRevenue: 725000,
        rating: 4.8,
        completionRate: 96
      },
      {
        staffId: '2',
        staffName: 'John Smith',
        totalBookings: 132,
        totalRevenue: 660000,
        rating: 4.6,
        completionRate: 94
      },
      {
        staffId: '3',
        staffName: 'Lisa Chen',
        totalBookings: 118,
        totalRevenue: 590000,
        rating: 4.9,
        completionRate: 98
      },
      {
        staffId: '4',
        staffName: 'Mike Davis',
        totalBookings: 95,
        totalRevenue: 475000,
        rating: 4.5,
        completionRate: 92
      }
    ];

    this.staffPerformance.set(mockData);

    const avgRating = mockData.reduce((sum, s) => sum + s.rating, 0) / mockData.length;
    this.averageRating.set(avgRating);
  }

  async loadBookingStats(): Promise<void> {
    // Mock data - replace with actual API call
    const mockStats: BookingStats = {
      pending: 23,
      confirmed: 67,
      completed: 145,
      cancelled: 8,
      noShow: 5
    };

    this.bookingStats.set(mockStats);

    const total = Object.values(mockStats).reduce((sum, val) => sum + val, 0);
    this.totalBookings.set(total);

    if (this.bookingStatusChart) {
      this.updateBookingStatusChart();
    }
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
        labels: data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
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
                const percentage = ((value / total) * 100).toFixed(1);
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
      new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

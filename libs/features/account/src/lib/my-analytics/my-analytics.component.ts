import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { BookingService, ClientAnalytics, AppCurrencyPipe } from '@org/shared-data-access';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

@Component({
  selector: 'lib-my-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardModule,
    ButtonModule,
    ProgressSpinnerModule,
    TagModule,
    AppCurrencyPipe,
  ],
  styles: [`
    :host { display: block; }

    .analytics-wrap {
      max-width: 800px;
      margin: 0 auto;
      padding: 28px 16px 64px;
    }
    .page-title {
      font-size: clamp(1.5rem, 4vw, 2rem);
      font-weight: 800;
      margin: 0 0 28px;
    }
    .center-spinner {
      display: flex;
      justify-content: center;
      padding: 80px 0;
    }
    .error-msg {
      text-align: center;
      padding: 40px;
      color: #dc2626;
    }
    .empty-msg {
      text-align: center;
      padding: 60px 16px;
      color: #6b7280;
    }

    /* KPI cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    @media (min-width: 640px) {
      .kpi-grid { grid-template-columns: repeat(4, 1fr); }
    }
    .kpi-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px 16px;
      text-align: center;
    }
    :host-context(.dark) .kpi-card {
      background: #1f1f23;
      border-color: #3f3f46;
    }
    .kpi-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #6750a4;
      margin: 0;
    }
    .kpi-label {
      font-size: 0.8rem;
      color: #6b7280;
      margin: 6px 0 0;
    }

    /* Chart section */
    .chart-section {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 0 0 16px;
    }
    .chart-container {
      position: relative;
      height: 240px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
    }
    :host-context(.dark) .chart-container {
      background: #1f1f23;
      border-color: #3f3f46;
    }

    /* Lists */
    .list-section {
      margin-bottom: 32px;
    }
    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      margin-bottom: 8px;
      background: #fff;
    }
    :host-context(.dark) .list-item {
      background: #1f1f23;
      border-color: #3f3f46;
    }
    .list-item-name {
      font-weight: 600;
      font-size: 0.95rem;
    }
    .list-item-count {
      font-size: 0.85rem;
      color: #6b7280;
    }
    .salon-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
  `],
  template: `
    <div class="analytics-wrap">
      <h1 class="page-title">My Analytics</h1>

      @if (loading()) {
        <div class="center-spinner">
          <p-progressspinner strokeWidth="4" [style]="{width:'48px', height:'48px'}" />
        </div>
      } @else if (error()) {
        <p class="error-msg">{{ error() }}</p>
      } @else if (!analytics()) {
        <p class="empty-msg">No booking data yet. Book your first visit to see analytics!</p>
      } @else {
        <!-- KPI Cards -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <p class="kpi-value">{{ analytics()!.totalBookings }}</p>
            <p class="kpi-label">Total Visits</p>
          </div>
          <div class="kpi-card">
            <p class="kpi-value">{{ analytics()!.totalSpent | appCurrency }}</p>
            <p class="kpi-label">Total Spent</p>
          </div>
          <div class="kpi-card">
            <p class="kpi-value">{{ analytics()!.averageBookingValue | appCurrency }}</p>
            <p class="kpi-label">Avg per Visit</p>
          </div>
          <div class="kpi-card">
            <p class="kpi-value">{{ daysSinceLastVisit() }}</p>
            <p class="kpi-label">Days Since Last Visit</p>
          </div>
        </div>

        <!-- Monthly Spending Chart -->
        @if (analytics()!.monthlySpending.length) {
          <div class="chart-section">
            <h3 class="section-title">Monthly Spending (Last 6 Months)</h3>
            <div class="chart-container">
              <canvas #chartCanvas></canvas>
            </div>
          </div>
        }

        <!-- Favorite Services -->
        @if (analytics()!.favoriteServices.length) {
          <div class="list-section">
            <h3 class="section-title">Top Services</h3>
            @for (svc of analytics()!.favoriteServices; track svc.serviceName) {
              <div class="list-item">
                <span class="list-item-name">{{ svc.serviceName }}</span>
                <span class="list-item-count">{{ svc.count }} {{ svc.count === 1 ? 'visit' : 'visits' }}</span>
              </div>
            }
          </div>
        }

        <!-- Favorite Salons -->
        @if (analytics()!.favoriteSalons.length) {
          <div class="list-section">
            <h3 class="section-title">Favorite Salons</h3>
            @for (salon of analytics()!.favoriteSalons; track salon.salonId) {
              <div class="list-item">
                <div>
                  <span class="list-item-name">{{ salon.salonName }}</span>
                  <span class="list-item-count" style="margin-left: 8px">
                    {{ salon.visitCount }} {{ salon.visitCount === 1 ? 'visit' : 'visits' }}
                  </span>
                </div>
                <div class="salon-actions">
                  <p-button
                    label="Book Again"
                    icon="pi pi-replay"
                    severity="secondary"
                    [outlined]="true"
                    size="small"
                    (onClick)="bookAgain(salon)"
                  />
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class MyAnalyticsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private readonly bookingService = inject(BookingService);
  private readonly router = inject(Router);
  private chart: Chart | null = null;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly analytics = signal<ClientAnalytics | null>(null);

  readonly daysSinceLastVisit = computed(() => {
    const a = this.analytics();
    if (!a?.lastVisit) return '—';
    const diff = Date.now() - new Date(a.lastVisit).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  });

  constructor() {
    this.bookingService.getMyAnalytics().subscribe({
      next: (data) => {
        this.analytics.set(data.totalBookings > 0 ? data : null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load analytics. Please try again later.');
        this.loading.set(false);
      },
    });
  }

  ngAfterViewInit(): void {
    // Chart is rendered after analytics data arrives; watch for it
    // Use a small timeout to ensure the canvas is in the DOM after @if resolves
    const tryRender = () => {
      const a = this.analytics();
      if (!a || !this.chartCanvas?.nativeElement) return;
      this.renderChart(a.monthlySpending);
    };

    // Re-check after a tick so the @if block has rendered
    setTimeout(tryRender, 0);
  }

  private renderChart(data: ClientAnalytics['monthlySpending']): void {
    if (this.chart) {
      this.chart.destroy();
    }

    const labels = data.map((d) => {
      const [year, month] = d.month.split('-');
      const date = new Date(+year, +month - 1);
      return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });
    const values = data.map((d) => d.total);

    this.chart = new Chart(this.chartCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Spending',
            data: values,
            backgroundColor: '#6750a4',
            borderRadius: 6,
            maxBarThickness: 48,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }

  bookAgain(salon: ClientAnalytics['favoriteSalons'][0]): void {
    const queryParams: Record<string, string> = {};
    if (salon.lastServiceIds?.length) {
      queryParams['serviceIds'] = salon.lastServiceIds.join(',');
    }
    this.router.navigate(['/booking', salon.salonId], { queryParams });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}

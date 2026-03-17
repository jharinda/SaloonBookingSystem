import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { Card } from 'primeng/card';
import { Skeleton } from 'primeng/skeleton';
import { ChartModule } from 'primeng/chart';
import { Message } from 'primeng/message';

import { SalonAdminService, CurrencyService } from '@org/shared-data-access';
import { Booking } from '@org/models';

interface KpiCard {
  label: string;
  displayValue: string;
  subtitle: string;
  icon: string;
  /** Tailwind bg class for the icon bubble */
  iconBg: string;
  /** Tailwind text class for the icon itself */
  iconColor: string;
  /** Percentage change vs last month; null hides the trend chip */
  trend: number | null;
}

@Component({
  selector: 'lib-dashboard-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, Skeleton, ChartModule, Message, DecimalPipe, NgClass],
  templateUrl: './dashboard-overview.component.html',
})
export class DashboardOverviewComponent implements OnInit {
  private readonly adminService = inject(SalonAdminService);
  private readonly currency     = inject(CurrencyService);

  // ── Async state ──────────────────────────────────────────────────────
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);

  // ── Template-bound data ───────────────────────────────────────────────
  readonly kpiCards    = signal<KpiCard[]>([]);
  readonly revenueData = signal<object>({});
  readonly chartOptions = signal<object>({});

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.chartOptions.set(this._buildChartOptions());
    this._loadData();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  private _loadData(): void {
    this.adminService
      .getOwnSalon()
      .pipe(
        switchMap((salon) => {
          const today = new Date();
          const { thisMonthStart, lastMonthStart, lastMonthEnd, last7Start } =
            this._dateRanges(today);
          const id = salon._id;

          return forkJoin({
            today:     this.adminService.getTodayBookings(id)
                         .pipe(catchError(() => of([] as Booking[]))),
            thisMonth: this.adminService.getBookingsByRange(id, thisMonthStart, this._fmtDate(today))
                         .pipe(catchError(() => of([] as Booking[]))),
            lastMonth: this.adminService.getBookingsByRange(id, lastMonthStart, lastMonthEnd)
                         .pipe(catchError(() => of([] as Booking[]))),
            last7:     this.adminService.getBookingsByRange(id, last7Start, this._fmtDate(today))
                         .pipe(catchError(() => of([] as Booking[]))),
            rating:    of(salon.rating),
          });
        }),
      )
      .subscribe({
        next: ({ today, thisMonth, lastMonth, last7, rating }) => {
          this._buildKpiCards(today, thisMonth, lastMonth, rating);
          this._buildChartData(last7);
          this.isLoading.set(false);
        },
        error: () => {
          this.loadError.set('Failed to load dashboard data. Please try again.');
          this.isLoading.set(false);
        },
      });
  }

  // ── KPI card composition ──────────────────────────────────────────────────

  private _buildKpiCards(
    todayBookings:     Booking[],
    thisMonthBookings: Booking[],
    lastMonthBookings: Booking[],
    salonRating:       number,
  ): void {
    // ── Today's Bookings ──────────────────────────────────────────────────
    const todayCount       = todayBookings.length;
    const confirmedCount   = todayBookings.filter((b) => b.status === 'CONFIRMED').length;
    const lastMonthDayAvg  = lastMonthBookings.length / 30;
    const bookingTrend     = lastMonthDayAvg > 0
      ? ((todayCount - lastMonthDayAvg) / lastMonthDayAvg) * 100
      : null;

    // ── Monthly Revenue ───────────────────────────────────────────────────
    const thisRevenue  = this._sumRevenue(thisMonthBookings);
    const lastRevenue  = this._sumRevenue(lastMonthBookings);
    const revenueTrend = lastRevenue > 0
      ? ((thisRevenue - lastRevenue) / lastRevenue) * 100
      : null;

    // ── Active Clients ────────────────────────────────────────────────────
    const thisClients  = new Set(thisMonthBookings.map((b) => b.clientId)).size;
    const lastClients  = new Set(lastMonthBookings.map((b) => b.clientId)).size;
    const clientsTrend = lastClients > 0
      ? ((thisClients - lastClients) / lastClients) * 100
      : null;

    this.kpiCards.set([
      {
        label:        "Today's Bookings",
        displayValue: String(todayCount),
        subtitle:     `${confirmedCount} confirmed`,
        icon:         'pi pi-calendar',
        iconBg:       'bg-sky-100 dark:bg-sky-900',
        iconColor:    'text-sky-600 dark:text-sky-400',
        trend:        bookingTrend !== null ? this._round1(bookingTrend) : null,
      },
      {
        label:        'Monthly Revenue',
        displayValue: this.currency.format(thisRevenue),
        subtitle:     'From completed bookings',
        icon:         'pi pi-pound',
        iconBg:       'bg-emerald-100 dark:bg-emerald-900',
        iconColor:    'text-emerald-600 dark:text-emerald-400',
        trend:        revenueTrend !== null ? this._round1(revenueTrend) : null,
      },
      {
        label:        'Active Clients',
        displayValue: String(thisClients),
        subtitle:     'Unique this month',
        icon:         'pi pi-users',
        iconBg:       'bg-violet-100 dark:bg-violet-900',
        iconColor:    'text-violet-600 dark:text-violet-400',
        trend:        clientsTrend !== null ? this._round1(clientsTrend) : null,
      },
      {
        label:        'Average Rating',
        displayValue: salonRating > 0 ? salonRating.toFixed(1) : '—',
        subtitle:     'All-time average',
        icon:         'pi pi-star',
        iconBg:       'bg-amber-100 dark:bg-amber-900',
        iconColor:    'text-amber-500 dark:text-amber-400',
        trend:        null,
      },
    ]);
  }

  // ── Chart data ────────────────────────────────────────────────────────────

  private _buildChartData(bookings: Booking[]): void {
    const dates  = this._buildLast7DayDates();
    const labels = dates.map((d) => {
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    });

    const data = dates.map((date) =>
      bookings
        .filter((b) => b.appointmentDate === date && b.status === 'COMPLETED')
        .reduce((sum, b) => sum + b.totalPrice, 0),
    );

    this.revenueData.set({
      labels,
      datasets: [
        {
          label:           `Revenue (${this.currency.currencySymbol()})`,
          data,
          backgroundColor: '#059669',
          borderRadius:    6,
          borderSkipped:   false,
        },
      ],
    });
  }

  private _buildChartOptions(): object {
    const isDark    = document.documentElement.classList.contains('app-dark');
    const textColor = isDark ? '#A1A1AA' : '#71717A';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    return {
      responsive:           true,
      maintainAspectRatio:  false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: { y: number } }) =>
              ` ${this.currency.format(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks:  { color: textColor, font: { size: 11 } },
          grid:   { color: gridColor },
          border: { color: 'transparent' },
        },
        y: {
          ticks: {
            color:    textColor,
            font:     { size: 11 },
            callback: (v: number) => this.currency.format(v),
          },
          grid:   { color: gridColor },
          border: { color: 'transparent' },
        },
      },
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _sumRevenue(bookings: Booking[]): number {
    return bookings
      .filter((b) => b.status === 'COMPLETED')
      .reduce((sum, b) => sum + b.totalPrice, 0);
  }

  private _dateRanges(today: Date): {
    thisMonthStart: string;
    lastMonthStart: string;
    lastMonthEnd:   string;
    last7Start:     string;
  } {
    const thisMonthStart = this._fmtDate(
      new Date(today.getFullYear(), today.getMonth(), 1),
    );
    const lastMonthStart = this._fmtDate(
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
    );
    const lastMonthEnd = this._fmtDate(
      new Date(today.getFullYear(), today.getMonth(), 0),  // day 0 = last day of prev month
    );
    const last7Date = new Date(today);
    last7Date.setDate(today.getDate() - 6);
    const last7Start = this._fmtDate(last7Date);

    return { thisMonthStart, lastMonthStart, lastMonthEnd, last7Start };
  }

  private _buildLast7DayDates(): string[] {
    const result: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      result.push(this._fmtDate(d));
    }
    return result;
  }

  private _fmtDate(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private _round1(n: number): number {
    return Math.round(n * 10) / 10;
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Select } from 'primeng/select';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { Tag } from 'primeng/tag';

import { Booking, BookingStatus } from '@org/models';
import { SalonService, UserService } from '@org/shared-data-access';

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

@Component({
  selector: 'lib-stylist-appointments-all',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    Button,
    DatePicker,
    Select,
    TableModule,
    Tag,
  ],
  templateUrl: './stylist-appointments-all.component.html',
  styleUrl: './stylist-appointments-all.component.scss',
})
export class StylistAppointmentsAllComponent {
  private readonly user = inject(UserService);
  private readonly salonApi = inject(SalonService);

  /** Accepted salon — used to load service catalog for the filter */
  salonId = input<string>('');

  refreshNonce = input(0);

  bookingOpen = output<Booking>();

  rows = signal<Booking[]>([]);
  totalRecords = signal(0);
  loading = signal(false);

  dateRange = signal<Date[] | null>(this.defaultMonthRange());

  filterServiceId = signal('');

  serviceOptions = signal<{ label: string; value: string }[]>([
    { label: 'All services', value: '' },
  ]);

  lazyFirst = signal(0);

  private lastFirst = 0;
  private lastRows = 20;
  private lastSalonForServices = '';

  constructor() {
    effect(() => {
      const sid = this.salonId();
      if (sid) this.loadServiceOptions(sid);
    });

    effect(() => {
      const n = this.refreshNonce();
      if (n < 1) return;
      this.fetchPage(this.lastFirst, this.lastRows);
    });
  }

  private defaultMonthRange(): Date[] {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [start, end];
  }

  private loadServiceOptions(salonId: string): void {
    if (this.lastSalonForServices === salonId) return;
    this.lastSalonForServices = salonId;
    this.salonApi.getSalonById(salonId).subscribe({
      next: (salon) => {
        const list = salon.services ?? [];
        this.serviceOptions.set([
          { label: 'All services', value: '' },
          ...list
            .filter((s) => s.active !== false)
            .map((s) => ({
              label: s.name,
              value: s._id,
            })),
        ]);
      },
      error: () => {
        /* keep All only */
      },
    });
  }

  onLazyLoad(ev: TableLazyLoadEvent): void {
    const first = ev.first ?? 0;
    const rows = ev.rows ?? 20;
    this.lazyFirst.set(first);
    this.lastFirst = first;
    this.lastRows = rows;
    this.fetchPage(first, rows);
  }

  onDateRangeChange(): void {
    this.lastFirst = 0;
    this.lazyFirst.set(0);
    this.fetchPage(0, this.lastRows);
  }

  onFilterChange(): void {
    this.lastFirst = 0;
    this.lazyFirst.set(0);
    this.fetchPage(0, this.lastRows);
  }

  private fetchPage(first: number, rows: number): void {
    const range = this.dateRange();
    if (!range?.[0] || !range[1]) {
      this.rows.set([]);
      this.totalRecords.set(0);
      return;
    }

    const startDate = this.fmt(range[0]);
    const endDate = this.fmt(range[1]);
    const page = Math.floor(first / rows) + 1;

    this.loading.set(true);
    this.user
      .getStylistBookingsPage({
        startDate,
        endDate,
        serviceId: this.filterServiceId() || undefined,
        page,
        limit: rows,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.totalRecords.set(res.total);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.totalRecords.set(0);
          this.loading.set(false);
        },
      });
  }

  private fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  getStatusSeverity(status: BookingStatus): TagSeverity {
    const map: Record<BookingStatus, TagSeverity> = {
      PENDING: 'warn',
      CONFIRMED: 'info',
      IN_PROGRESS: 'secondary',
      COMPLETED: 'success',
      CANCELLED: 'danger',
      NO_SHOW: 'danger',
    };
    return map[status] ?? 'secondary';
  }
}

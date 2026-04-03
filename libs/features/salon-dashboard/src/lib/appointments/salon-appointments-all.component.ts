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

import { Booking, BookingStatus, SalonServiceItem } from '@org/models';
import {
  AppCurrencyPipe,
  SalonAdminService,
  SalonStaffMember,
} from '@org/shared-data-access';

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

@Component({
  selector: 'lib-salon-appointments-all',
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
    AppCurrencyPipe,
  ],
  templateUrl: './salon-appointments-all.component.html',
  styleUrl: './salon-appointments-all.component.scss',
})
export class SalonAppointmentsAllComponent {
  private readonly admin = inject(SalonAdminService);

  /** Salon id — required for API */
  salonId = input.required<string>();
  /** Services from salon catalog (service filter) */
  salonServices = input<SalonServiceItem[]>([]);
  /** Increment to reload current page after a booking mutation elsewhere */
  refreshNonce = input(0);

  bookingOpen = output<Booking>();

  rows = signal<Booking[]>([]);
  totalRecords = signal(0);
  loading = signal(false);

  /** PrimeNG range: [start, end] */
  dateRange = signal<Date[] | null>(this.defaultMonthRange());

  filterStylistId = signal('');
  filterServiceId = signal('');

  staffOptions = signal<{ label: string; value: string }[]>([
    { label: 'All stylists', value: '' },
  ]);

  serviceOptions = signal<{ label: string; value: string }[]>([
    { label: 'All services', value: '' },
  ]);

  lazyFirst = signal(0);

  private lastFirst = 0;
  private lastRows = 20;
  private lastStaffSalonId = '';

  constructor() {
    effect(() => {
      const id = this.salonId();
      if (id) this.loadStaff(id);
    });

    effect(() => {
      const services = this.salonServices();
      this.serviceOptions.set([
        { label: 'All services', value: '' },
        ...services
          .filter((s) => s.active !== false)
          .map((s) => ({
            label: s.name,
            value: s._id,
          })),
      ]);
    });

    effect(() => {
      const n = this.refreshNonce();
      if (n < 1) return;
      this.fetchPage(this.lastFirst, this.lastRows);
    });
  }

  ngOnInit(): void {
    this.fetchPage(0, this.lastRows);
  }

  private defaultMonthRange(): Date[] {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [start, end];
  }

  private loadStaff(salonId: string): void {
    if (this.lastStaffSalonId === salonId) return;
    this.lastStaffSalonId = salonId;
    this.admin.getSalonStaff(salonId).subscribe({
      next: (staff: SalonStaffMember[]) => {
        this.staffOptions.set([
          { label: 'All stylists', value: '' },
          ...staff.map((s) => ({
            label: `${s.firstName} ${s.lastName}`.trim(),
            value: s._id,
          })),
        ]);
      },
      error: () => {
        /* keep All stylists only */
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
    const id = this.salonId();
    const range = this.dateRange();
    if (!id || !range?.[0] || !range[1]) {
      this.rows.set([]);
      this.totalRecords.set(0);
      return;
    }

    const startDate = this.fmt(range[0]);
    const endDate = this.fmt(range[1]);
    const page = Math.floor(first / rows) + 1;

    this.loading.set(true);
    this.admin
      .getPaginatedBookings({
        salonId: id,
        startDate,
        endDate,
        stylistId: this.filterStylistId() || undefined,
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

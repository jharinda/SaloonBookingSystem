import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Table, TableModule }      from 'primeng/table';
import { Toolbar }                 from 'primeng/toolbar';
import { Tag }                     from 'primeng/tag';
import { Button }                  from 'primeng/button';
import { InputText }               from 'primeng/inputtext';
import { IconField }               from 'primeng/iconfield';
import { InputIcon }               from 'primeng/inputicon';
import { Select }                  from 'primeng/select';
import { ConfirmDialog }           from 'primeng/confirmdialog';
import { Toast }                   from 'primeng/toast';
import { ProgressSpinner }         from 'primeng/progressspinner';
import { Message }                 from 'primeng/message';
import { ConfirmationService, MessageService } from 'primeng/api';

import { SalonAdminService } from '@org/shared-data-access';
import { Booking, BookingStatus } from '@org/models';

/** Severity map fed directly into <p-tag> */
type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

interface StatusOption {
  label: string;
  value: string | null;
}

@Component({
  selector: 'lib-bookings-today',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService, MessageService],
  imports: [
    FormsModule,
    DatePipe,
    TableModule,
    Toolbar,
    Tag,
    Button,
    InputText,
    IconField,
    InputIcon,
    Select,
    ConfirmDialog,
    Toast,
    ProgressSpinner,
    Message,
  ],
  templateUrl: './bookings-today.component.html',
})
export class BookingsTodayComponent implements OnInit {
  // ── Injections ────────────────────────────────────────────────────────────
  private readonly adminService   = inject(SalonAdminService);
  private readonly confirmSvc     = inject(ConfirmationService);
  private readonly msgSvc         = inject(MessageService);
  private readonly cdr            = inject(ChangeDetectorRef);

  /** Direct reference to the p-table for filterGlobal */
  @ViewChild('dt') dt!: Table;

  // ── State ─────────────────────────────────────────────────────────────────
  readonly isLoading       = signal(true);
  readonly loadError       = signal<string | null>(null);
  readonly cancelInFlight  = signal<string | null>(null);

  bookings: Booking[] = [];

  // ── Filter state ──────────────────────────────────────────────────────────
  selectedStatus: string | null = null;
  searchValue = '';

  readonly statusOptions: StatusOption[] = [
    { label: 'All Statuses',  value: null },
    { label: 'Confirmed',     value: 'CONFIRMED' },
    { label: 'Pending',       value: 'PENDING' },
    { label: 'In Progress',   value: 'IN_PROGRESS' },
    { label: 'Completed',     value: 'COMPLETED' },
    { label: 'Cancelled',     value: 'CANCELLED' },
    { label: 'No Show',       value: 'NO_SHOW' },
  ];

  /** Fields searched by the global filter */
  readonly globalFilterFields = [
    'clientId',
    'serviceName',
    'stylistName',
    'appointmentDate',
    'startTime',
    'status',
  ];

  // ── Private ───────────────────────────────────────────────────────────────
  private salonId = '';

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.adminService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this._loadBookings();
      },
      error: () => {
        this.loadError.set('Could not identify your salon. Please refresh.');
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  loadBookings(): void {
    this._loadBookings();
  }

  // ── Severity helper ───────────────────────────────────────────────────────

  getSeverity(status: BookingStatus | string): TagSeverity {
    switch (status) {
      case 'CONFIRMED':   return 'success';
      case 'PENDING':     return 'warn';
      case 'CANCELLED':   return 'danger';
      case 'COMPLETED':   return 'secondary';
      case 'IN_PROGRESS': return 'info';
      case 'NO_SHOW':     return 'contrast';
      default:            return 'secondary';
    }
  }

  getStatusLabel(status: BookingStatus | string): string {
    switch (status) {
      case 'CONFIRMED':   return 'Confirmed';
      case 'PENDING':     return 'Pending';
      case 'CANCELLED':   return 'Cancelled';
      case 'COMPLETED':   return 'Completed';
      case 'IN_PROGRESS': return 'In Progress';
      case 'NO_SHOW':     return 'No Show';
      default:            return status;
    }
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dt.filterGlobal(value, 'contains');
  }

  onStatusChange(value: string | null): void {
    if (value) {
      this.dt.filter(value, 'status', 'equals');
    } else {
      this.dt.filter(null, 'status', 'equals');
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  viewBooking(appt: Booking): void {
    this.msgSvc.add({
      severity: 'info',
      summary:  appt.serviceName,
      detail:   [
        `Date: ${appt.appointmentDate}`,
        `Time: ${appt.startTime} – ${appt.endTime}`,
        `Status: ${this.getStatusLabel(appt.status)}`,
        appt.notes ? `Notes: ${appt.notes}` : '',
      ].filter(Boolean).join('\n'),
      life: 6000,
    });
  }

  confirmCancel(appt: Booking): void {
    this.confirmSvc.confirm({
      header:           'Cancel Appointment',
      message:          `Cancel the ${appt.serviceName} booking on ${appt.appointmentDate} at ${appt.startTime}?`,
      icon:             'pi pi-exclamation-triangle',
      acceptLabel:      'Yes, cancel it',
      rejectLabel:      'Keep it',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this._doCancel(appt),
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _loadBookings(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    const today  = new Date();
    const from   = this._fmtDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const to     = this._fmtDate(new Date(today.getFullYear(), today.getMonth() + 3, 0));

    this.adminService.getBookingsByRange(this.salonId, from, to).subscribe({
      next: (data) => {
        this.bookings = data;
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadError.set('Could not load appointments. Please try again.');
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private _doCancel(appt: Booking): void {
    this.cancelInFlight.set(appt._id);
    this.adminService.cancelBooking(appt._id).subscribe({
      next: (updated) => {
        this.bookings = this.bookings.map((b) => (b._id === appt._id ? updated : b));
        this.cancelInFlight.set(null);
        this.cdr.markForCheck();
        this.msgSvc.add({
          severity: 'success',
          summary:  'Cancelled',
          detail:   'Appointment has been cancelled.',
          life:     3500,
        });
      },
      error: () => {
        this.cancelInFlight.set(null);
        this.msgSvc.add({
          severity: 'error',
          summary:  'Error',
          detail:   'Could not cancel the appointment. Please try again.',
          life:     4000,
        });
      },
    });
  }

  private _fmtDate(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

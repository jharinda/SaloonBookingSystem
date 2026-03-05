import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
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

import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

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
    FullCalendarModule,
  ],
  templateUrl: './bookings-today.component.html',
  styles: [`
    /* ── Now-indicator: red line with leading dot ── */
    ::ng-deep .fc .fc-timegrid-now-indicator-line {
      border-color: #ef4444;
      border-width: 2px;
    }
    ::ng-deep .fc .fc-timegrid-now-indicator-arrow {
      border-color: #ef4444;
    }

    :host-context(.app-dark) ::ng-deep .fc {
      --fc-border-color: #3f3f46;
      --fc-button-bg-color: #27272a;
      --fc-button-border-color: #3f3f46;
      --fc-button-hover-bg-color: #3f3f46;
      --fc-button-hover-border-color: #52525b;
      --fc-button-active-bg-color: #52525b;
      --fc-today-bg-color: rgba(139,92,246,.08);
      --fc-neutral-bg-color: #18181b;
      --fc-page-bg-color: #18181b;
      color: #d4d4d8;
    }

    :host-context(.app-dark) ::ng-deep .fc .fc-toolbar-title { color: #f4f4f5; }
    :host-context(.app-dark) ::ng-deep .fc .fc-col-header-cell { background: #27272a; color: #a1a1aa; }
    :host-context(.app-dark) ::ng-deep .fc .fc-timegrid-slot-label { color: #71717a; }
    :host-context(.app-dark) ::ng-deep .fc .fc-daygrid-day-number { color: #a1a1aa; }
    :host-context(.app-dark) ::ng-deep .fc .fc-timegrid-now-indicator-line { border-color: #f87171; }
    :host-context(.app-dark) ::ng-deep .fc .fc-timegrid-now-indicator-arrow { border-color: #f87171; }
  `],
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

  readonly bookings        = signal<Booking[]>([]);
  readonly viewMode        = signal<'table' | 'calendar'>('table');
  readonly confirmInFlight = signal<string | null>(null);

  readonly calendarOptions = computed<CalendarOptions>(() => ({
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    // ── Real-time "now" indicator (red line + dot, like Microsoft Teams) ──
    nowIndicator: true,
    scrollToTime: {
      hours:   new Date().getHours(),
      minutes: Math.max(0, new Date().getMinutes() - 15),
    },
    events: this.bookings().map((b) => ({
      id: b._id,
      title: (b.clientName || ('Client ·' + b._id.slice(-6))) + ' — ' + (b.serviceName || b.services?.[0]?.name || 'Appointment') + (b.stylistName ? ` · ${b.stylistName}` : ''),
      start: `${b.appointmentDate}T${b.startTime}:00`,
      end:   `${b.appointmentDate}T${b.endTime}:00`,
      backgroundColor: this._statusColor(b.status),
      borderColor:     this._statusColor(b.status),
      textColor:       '#ffffff',
      extendedProps: { booking: b },
    })),
    height: 'auto',
    editable: false,
    selectable: false,
    eventDisplay: 'block',
    eventMinHeight: 22,
    displayEventTime: true,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    moreLinkClick: 'popover',
    eventClick: (info) => this.viewBooking(info.event.extendedProps['booking']),
  }));

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

  getServiceDisplay(appt: Booking): string {
    if (appt.services?.length) {
      return appt.services.map((s) => s.name).join(', ');
    }
    return appt.serviceName || '—';
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

  confirmBooking(appt: Booking): void {
    this.confirmInFlight.set(appt._id);
    this.adminService.confirmBooking(appt._id).subscribe({
      next: (updated) => {
        this.bookings.update((prev) =>
          prev.map((b) => (b._id === appt._id ? updated : b)),
        );
        this.confirmInFlight.set(null);
        this.cdr.markForCheck();
        this.msgSvc.add({
          severity: 'success',
          summary: 'Approved',
          detail:  'Appointment has been confirmed.',
          life:     3500,
        });
      },
      error: () => {
        this.confirmInFlight.set(null);
        this.msgSvc.add({
          severity: 'error',
          summary:  'Error',
          detail:   'Could not confirm the appointment. Please try again.',
          life:     4000,
        });
      },
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
        this.bookings.set(data);
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
        this.bookings.update((prev) => prev.map((b) => (b._id === appt._id ? updated : b)));
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

  private _statusColor(status: BookingStatus | string): string {
    switch (status) {
      case 'CONFIRMED':   return '#10b981';
      case 'PENDING':     return '#f59e0b';
      case 'CANCELLED':   return '#ef4444';
      case 'COMPLETED':   return '#6b7280';
      case 'IN_PROGRESS': return '#3b82f6';
      case 'NO_SHOW':     return '#374151';
      default:            return '#6b7280';
    }
  }

  private _fmtDate(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

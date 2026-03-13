import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { Table, TableModule }      from 'primeng/table';
import { Toolbar }                 from 'primeng/toolbar';
import { Tag }                     from 'primeng/tag';
import { Button }                  from 'primeng/button';
import { InputText }               from 'primeng/inputtext';
import { IconField }               from 'primeng/iconfield';
import { InputIcon }               from 'primeng/inputicon';
import { MultiSelect }             from 'primeng/multiselect';
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

import { SalonAdminService, RealtimeNotificationService, Station } from '@org/shared-data-access';
import { Booking, BookingStatus } from '@org/models';

/** Severity map fed directly into <p-tag> */
type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

interface StatusOption {
  label: string;
  value: string;
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
    MultiSelect,
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

    /* ── Booking highlight animation (triggered from notification click) ── */
    @keyframes rowGrow {
      0%   { padding-top: var(--p, .5rem); padding-bottom: var(--p, .5rem); }
      35%  { padding-top: 1.35rem;         padding-bottom: 1.35rem; }
      65%  { padding-top: .3rem;           padding-bottom: .3rem; }
      100% { padding-top: var(--p, .5rem); padding-bottom: var(--p, .5rem); }
    }

    @keyframes rowOutline {
      0%   { outline-color: rgba(124,58,237,0); }
      25%  { outline-color: #7c3aed; }
      75%  { outline-color: #7c3aed; }
      100% { outline-color: rgba(124,58,237,0); }
    }

    /* Outer border on the row itself — no inter-column lines */
    ::ng-deep tr.booking-highlight {
      outline: 2px solid #7c3aed;
      border-radius: 8px;
      animation: rowOutline 1.8s ease forwards;
    }

    /* Grow effect on cells only — no outline */
    ::ng-deep tr.booking-highlight td {
      animation: rowGrow 0.85s cubic-bezier(.4,0,.2,1) forwards;
      background: rgba(139,92,246,0.08);
    }
  `],
})
export class BookingsTodayComponent implements OnInit {
  // ── Injections ────────────────────────────────────────────────────────────
  private readonly adminService      = inject(SalonAdminService);
  private readonly confirmSvc        = inject(ConfirmationService);
  private readonly msgSvc            = inject(MessageService);
  private readonly cdr               = inject(ChangeDetectorRef);
  private readonly route             = inject(ActivatedRoute);
  private readonly elRef             = inject(ElementRef);
  private readonly destroyRef        = inject(DestroyRef);
  private readonly realtimeSvc       = inject(RealtimeNotificationService);

  /** Direct reference to the p-table for filterGlobal */
  @ViewChild('dt') dt!: Table;

  // ── State ─────────────────────────────────────────────────────────────────
  readonly isLoading       = signal(true);
  readonly loadError       = signal<string | null>(null);
  readonly cancelInFlight  = signal<string | null>(null);

  readonly bookings        = signal<Booking[]>([]);
  readonly stations        = signal<Station[]>([]);
  readonly selectedStationId = signal<string | null>(null);
  readonly viewMode        = signal<'table' | 'calendar'>('table');
  readonly confirmInFlight = signal<string | null>(null);

  /** The booking id that should be highlighted (set after navigation from a notification). */
  readonly highlightedBookingId = signal<string | null>(null);

  /** Booking id read from ?bookingId= query param; consumed once after first data load. */
  private pendingHighlightId: string | null = null;

  readonly stationFilterOptions = computed(() => {
    const active = this.stations().filter((s) => s.isActive);
    return [{ _id: null as string | null, name: 'All Stations', isActive: true }, ...active];
  });

  readonly calendarOptions = computed<CalendarOptions>(() => {
    const stationId = this.selectedStationId();
    const filteredBookings = stationId
      ? this.bookings().filter((b) => b.stationId === stationId)
      : this.bookings();

    return {
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
      initialView: 'timeGridWeek',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      },
      nowIndicator: true,
      scrollToTime: {
        hours:   new Date().getHours(),
        minutes: Math.max(0, new Date().getMinutes() - 15),
      },
      events: filteredBookings.map((b) => ({
        id: b._id,
        title: (b.clientName || ('Client ·' + b._id.slice(-6))) + ' — ' + (b.serviceName || b.services?.[0]?.name || 'Appointment') + (b.stylistName ? ` · ${b.stylistName}` : '') + (b.stationName ? ` · ${b.stationName}` : ''),
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
    };
  });

  // ── Filter state ──────────────────────────────────────────────────────────
  selectedStatuses: string[] = ['PENDING', 'CONFIRMED'];
  searchValue = '';

  readonly statusOptions: StatusOption[] = [
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
    'stationName',
    'appointmentDate',
    'startTime',
    'status',
  ];

  /** Default sort: most recently submitted first */
  readonly defaultSortMeta = [
    { field: 'createdAt', order: -1 },
  ];

  // ── Private ───────────────────────────────────────────────────────────────
  private salonId = '';

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // ── 1. React to ?bookingId= — works even when already on this page ──────
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const bookingId = params['bookingId'] ?? null;
        if (!bookingId) return;

        if (this.salonId) {
          // Data already loaded — highlight immediately.
          this._applyHighlight(bookingId);
        } else {
          // Data not yet loaded — store for after first load.
          this.pendingHighlightId = bookingId;
        }
      });

    // ── 2. Real-time reload on new incoming booking ──────────────────────────
    this.realtimeSvc.notifications$
      .pipe(
        filter(({ event }) => event === 'booking.new' || event === 'booking.created'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.salonId) {
          this._loadBookings();
        }
      });

    // ── 3. Load salon + initial bookings ─────────────────────────────────────
    this.adminService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this._loadBookings();
        this._loadStations();
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

  onStationFilterChange(stationId: string | null): void {
    this.selectedStationId.set(stationId);
    if (this.dt && stationId) {
      this.dt.filter(stationId, 'stationId', 'equals');
    } else if (this.dt) {
      this.dt.filter(null, 'stationId', 'equals');
    }
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dt.filterGlobal(value, 'contains');
  }

  onStatusChange(values: string[]): void {
    if (values && values.length > 0) {
      this.dt.filter(values, 'status', 'in');
    } else {
      this.dt.filter(null, 'status', 'in');
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
        setTimeout(() => {
          if (this.pendingHighlightId) {
            const id = this.pendingHighlightId;
            this.pendingHighlightId = null;
            this._applyHighlight(id);
          } else {
            this.onStatusChange(this.selectedStatuses);
          }
        });
      },
      error: () => {
        this.loadError.set('Could not load appointments. Please try again.');
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private _loadStations(): void {
    this.adminService.getStations(this.salonId).subscribe({
      next: (data) => {
        this.stations.set(data.stations);
        this.cdr.markForCheck();
      },
      error: () => {
        // Non-fatal — station filter just won't show
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

  private _applyHighlight(bookingId: string): void {
    // Step 1: clear filters so the row is always rendered.
    this.selectedStatuses = [];
    this.dt.filter(null, 'status', 'in');

    // Step 2: jump paginator to the page that contains this booking.
    const idx = this.bookings().findIndex((b) => b._id === bookingId);
    if (idx !== -1) {
      const pageRows = this.dt.rows ?? 10;
      this.dt.first = Math.floor(idx / pageRows) * pageRows;
    }
    this.cdr.markForCheck();

    // Step 3: after the table re-renders, activate the CSS class and scroll.
    setTimeout(() => {
      // Always reset to null first so Angular removes the class, which forces
      // the CSS animation to restart — even if the same bookingId is re-used.
      this.highlightedBookingId.set(null);
      this.cdr.markForCheck();

      setTimeout(() => {
        this.highlightedBookingId.set(bookingId);
        this.cdr.markForCheck();

        const row = (this.elRef.nativeElement as HTMLElement)
          .querySelector<HTMLTableRowElement>(`tr[data-booking-id="${bookingId}"]`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Step 4: remove highlight class after animation finishes.
        setTimeout(() => {
          this.highlightedBookingId.set(null);
          this.cdr.markForCheck();
        }, 1800);
      }, 30); // one extra tick so null is painted before re-adding the class
    }, 150);
  }

  private _fmtDate(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

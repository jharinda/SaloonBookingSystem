import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  DestroyRef,
  OnInit,
  signal,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { Button } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Drawer } from 'primeng/drawer';
import { Select } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { Toolbar } from 'primeng/toolbar';
import { SelectButton } from 'primeng/selectbutton';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import { Booking, BookingStatus, Salon } from '@org/models';
import { SalonAdminService, Station, SalonStaffMember, AppCurrencyPipe, RealtimeNotificationService } from '@org/shared-data-access';
import type { StylistBreakDto } from '@org/shared-data-access';
import { CalendarGridComponent, CalendarColumn } from '@org/shared-ui';
import { CreateAppointmentDialogComponent, CreateAppointmentContext } from './create-appointment-dialog.component';

type ViewMode = 'day' | 'week' | 'month' | 'list';
type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

@Component({
  selector: 'lib-appointments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    Button,
    TableModule,
    Tag,
    Drawer,
    Select,
    Toast,
    Toolbar,
    SelectButton,
    DialogModule,
    TooltipModule,
    AppCurrencyPipe,
    CalendarGridComponent,
    CreateAppointmentDialogComponent,
    FullCalendarModule,
  ],
  providers: [MessageService],
  templateUrl: './appointments.component.html',
  styleUrl: './appointments.component.scss',
})
export class AppointmentsComponent implements OnInit {
  private readonly fullCalendarRef = viewChild(FullCalendarComponent);

  private readonly salonService = inject(SalonAdminService);
  private readonly messageService = inject(MessageService);
  private readonly realtimeSvc = inject(RealtimeNotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Consumed when opening the drawer from `?bookingId=` (e.g. notification deep link). */
  private pendingBookingId: string | null = null;

  // ── State ────────────────────────────────────────────────────────────────
  viewMode = signal<ViewMode>('day');
  bookings = signal<Booking[]>([]);
  breaks = signal<StylistBreakDto[]>([]);
  staffMembers = signal<SalonStaffMember[]>([]);
  stations = signal<Station[]>([]);
  selectedBooking = signal<Booking | null>(null);
  showBookingDetails = signal(false);
  loading = signal(false);
  selectedDate = signal(new Date());
  selectedStationId = signal<string | null>(null);
  salon = signal<Salon | null>(null);
  private salonId = '';

  // Create appointment dialog state
  showCreateDialog = signal(false);
  createAppointmentContext = signal<CreateAppointmentContext | null>(null);

  // View options (matching stylist view)
  viewOptions = [
    { label: 'Day', value: 'day', icon: 'pi pi-calendar' },
    { label: 'Week', value: 'week', icon: 'pi pi-calendar-clock' },
    { label: 'Month', value: 'month', icon: 'pi pi-th-large' },
    { label: 'List', value: 'list', icon: 'pi pi-list' },
  ];

  // ── Station filter options ───────────────────────────────────────────────
  stationFilterOptions = computed(() => {
    const active = this.stations().filter((s) => s.isActive);
    return [{ _id: null as string | null, name: 'All Stations', isActive: true }, ...active];
  });

  // ── Stylist name map ─────────────────────────────────────────────────────
  stylistNameMap = computed(() => {
    const map = new Map<string, string>();
    for (const s of this.staffMembers()) {
      map.set(s._id, `${s.firstName} ${s.lastName}`);
    }
    return map;
  });

  // ── Active stations for grid + dropdowns ─────────────────────────────────
  activeStations = computed(() => this.stations().filter((s) => s.isActive));

  // ── Grid columns for shared calendar component ───────────────────────
  gridColumns = computed<CalendarColumn[]>(() => {
    const stationId = this.selectedStationId();
    const stations = stationId
      ? this.activeStations().filter((s) => s._id === stationId)
      : this.activeStations();
    return stations.map((s) => ({ id: s._id, name: s.name }));
  });

  // ── Filtered bookings (by date + optional station) ───────────────────────
  filteredBookings = computed(() => {
    const bookings = this.bookings();
    const selectedDate = this.selectedDate();
    const dateStr = this._fmtDate(selectedDate);
    const stationId = this.selectedStationId();

    return bookings.filter((b) => {
      if (b.appointmentDate !== dateStr) return false;
      if (stationId && b.stationId !== stationId) return false;
      return true;
    });
  });

  // ── Calendar grid data — organised by station × time ─────────────────────
  calendarGrid = computed(() => {
    const bookings = this.filteredBookings();
    const stationId = this.selectedStationId();

    const stations = stationId
      ? this.activeStations().filter((s) => s._id === stationId)
      : this.activeStations();

    // Time slots from 8 AM to 8 PM in 30-min intervals (matching stylist)
    const timeSlots: string[] = [];
    for (let hour = 8; hour < 20; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }

    const grid: { [time: string]: { [stationId: string]: Booking | null } } = {};

    timeSlots.forEach((time) => {
      grid[time] = {};
      stations.forEach((station) => {
        const booking = bookings.find(
          (b) => b.stationId === station._id && b.startTime === time,
        );
        grid[time][station._id] = booking || null;
      });
    });

    return { grid, timeSlots, stations };
  });

  // ── Breaks indexed by time slot for calendar overlay ───────────────────
  breaksAtTime = computed(() => {
    const dayBreaks = this.breaks();
    const map: { [time: string]: StylistBreakDto[] } = {};
    for (const brk of dayBreaks) {
      if (!map[brk.startTime]) map[brk.startTime] = [];
      map[brk.startTime].push(brk);
    }
    return map;
  });

  /**
   * Single FullCalendar for week + month. Switching views must use `calendar.changeView()` —
   * updating `initialView` in options alone often does nothing after first render.
   */
  fullCalendarOptions = computed<CalendarOptions>(() => {
    const mode = this.viewMode();
    const initialView = mode === 'month' ? 'dayGridMonth' : 'timeGridWeek';
    const allBookings = this.bookings();
    const allBreaks = this.breaks();
    const d = this.selectedDate();
    const initialDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    return {
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
      initialView,
      initialDate,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: '',
      },
      nowIndicator: true,
      scrollToTime: {
        hours: new Date().getHours(),
        minutes: Math.max(0, new Date().getMinutes() - 15),
      },
      events: [
        ...allBookings.map((b) => ({
          id: b._id,
          title:
            (b.clientName || 'Client') +
            ' — ' +
            (b.serviceName || b.services?.[0]?.name || 'Appointment') +
            (b.stationName ? ` · ${b.stationName}` : ''),
          start: `${b.appointmentDate}T${b.startTime}:00`,
          end: `${b.appointmentDate}T${b.endTime}:00`,
          backgroundColor: this._statusColor(b.status),
          borderColor: this._statusColor(b.status),
          textColor: '#ffffff',
          extendedProps: { booking: b },
        })),
        ...allBreaks.map((brk) => ({
          id: `break-${brk._id}`,
          title: `${this.breakTypeLabel(brk.type)} — ${this.getStylistName(brk.stylistId)}`,
          start: `${brk.date}T${brk.startTime}:00`,
          end: `${brk.date}T${brk.endTime}:00`,
          backgroundColor: '#f59e0b',
          borderColor: '#d97706',
          textColor: '#ffffff',
          display: 'block' as const,
          extendedProps: { isBreak: true, break: brk },
        })),
      ],
      height: 'auto',
      editable: false,
      selectable: false,
      eventDisplay: 'block',
      eventMinHeight: 22,
      displayEventTime: true,
      eventTimeFormat: { hour: '2-digit' as const, minute: '2-digit' as const, hour12: false },
      eventClick: (info) => {
        if (info.event.extendedProps['isBreak']) {
          const brk = info.event.extendedProps['break'] as StylistBreakDto;
          this.messageService.add({
            severity: 'info',
            summary: `${this.breakTypeLabel(brk.type)} — ${this.getStylistName(brk.stylistId)}`,
            detail: `${brk.startTime} – ${brk.endTime}${brk.note ? '\n' + brk.note : ''}`,
            life: 5000,
          });
        } else {
          this.openBookingDetails(info.event.extendedProps['booking']);
        }
      },
    };
  });

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

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params['bookingId'] ?? null;
      if (!id || !this.salonId) return;
      this.pendingBookingId = id;
      this.openBookingFromQueryParam();
    });

    this.loading.set(true);
    this.salonService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this.salon.set(salon);
        this.loadStations();
        this.loadStaff();
        const bookingId = this.route.snapshot.queryParamMap.get('bookingId');
        if (bookingId) {
          this.pendingBookingId = bookingId;
          this.openBookingFromQueryParam();
        } else {
          this.loadData();
        }
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to identify your salon. Please refresh.',
        });
        this.loading.set(false);
      },
    });

    // ── Real-time: reload on new incoming booking events ──────
    this.realtimeSvc.notifications$
      .pipe(
        filter(({ event }) => event === 'booking.new' || event === 'booking.created'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.salonId) {
          this.loadData();
        }
      });
  }

  /** Resolve `?bookingId=` after salon is known (notification deep link). */
  private openBookingFromQueryParam(): void {
    const id = this.pendingBookingId ?? this.route.snapshot.queryParamMap.get('bookingId');
    if (!id || !this.salonId) return;
    this.pendingBookingId = null;
    this.loading.set(true);
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const end = new Date();
    end.setDate(end.getDate() + 90);
    this.salonService.getBookingsByRange(this.salonId, this._fmtDate(start), this._fmtDate(end)).subscribe({
      next: (list) => {
        const b = list.find((x) => x._id === id);
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { bookingId: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        if (b) {
          this.selectedDate.set(AppointmentsComponent._parseYmdToLocalNoon(b.appointmentDate));
          this.viewMode.set('day');
          this.bookings.set(list.filter((x) => x.appointmentDate === b.appointmentDate));
          this.loadBreaks(b.appointmentDate);
          this.openBookingDetails(b);
        } else {
          this.messageService.add({
            severity: 'warn',
            summary: 'Booking',
            detail: 'Could not find that appointment.',
          });
          this.loadData();
        }
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading.set(false);
        this.loadData();
        this.cdr.markForCheck();
      },
    });
  }

  private static _parseYmdToLocalNoon(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  // ── Data Loading ─────────────────────────────────────────────────────────
  loadData(): void {
    if (!this.salonId) return;
    this.loading.set(true);

    const mode = this.viewMode();
    const selected = this.selectedDate();

    let startDate: string;
    let endDate: string;

    if (mode === 'week') {
      const start = new Date(selected);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      startDate = this._fmtDate(start);
      endDate = this._fmtDate(end);
    } else if (mode === 'month') {
      const start = new Date(selected.getFullYear(), selected.getMonth(), 1);
      const end = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
      startDate = this._fmtDate(start);
      endDate = this._fmtDate(end);
    } else {
      const dateStr = this._fmtDate(selected);
      startDate = dateStr;
      endDate = dateStr;
    }

    this.salonService.getBookingsByRange(this.salonId, startDate, endDate).subscribe({
      next: (data) => {
        this.bookings.set(data);
        this.loading.set(false);
        this.cdr.markForCheck();
        if (mode === 'week' || mode === 'month') {
          setTimeout(() => this.syncFullCalendarView(), 0);
        }
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load appointments',
        });
        this.loading.set(false);
      },
    });

    this.loadBreaks(this._fmtDate(selected));
  }

  loadBreaks(dateStr?: string): void {
    if (!this.salonId) return;
    const date = dateStr ?? this._fmtDate(this.selectedDate());
    this.salonService.getSalonStylistBreaks(this.salonId, date).subscribe({
      next: (data) => {
        this.breaks.set(data);
        this.cdr.markForCheck();
      },
      error: () => this.breaks.set([]),
    });
  }

  private loadStaff(): void {
    if (!this.salonId) return;
    this.salonService.getSalonStaff(this.salonId).subscribe({
      next: (data) => this.staffMembers.set(data),
      error: () => { /* ignore */ },
    });
  }

  loadStations(): void {
    if (!this.salonId) return;
    this.salonService.getStations(this.salonId).subscribe({
      next: (data) => {
        this.stations.set(data.stations);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load stations',
        });
      },
    });
  }

  // ── View Mode Change ──────────────────────────────────────────────────────
  onViewModeChange(mode: ViewMode): void {
    const prev = this.viewMode();
    this.viewMode.set(mode);
    this.loadData();
    const wasRange = prev === 'week' || prev === 'month';
    const isRange = mode === 'week' || mode === 'month';
    if (wasRange && isRange && prev !== mode) {
      setTimeout(() => this.syncFullCalendarView(), 0);
    }
  }

  /** Apply week vs month and anchor date via Calendar API (options.initialView is sticky). */
  private syncFullCalendarView(): void {
    const mode = this.viewMode();
    if (mode !== 'week' && mode !== 'month') return;
    const api = this.fullCalendarRef()?.getApi();
    if (!api) return;
    const viewName = mode === 'month' ? 'dayGridMonth' : 'timeGridWeek';
    if (api.view.type !== viewName) {
      api.changeView(viewName);
    }
    api.gotoDate(this.selectedDate());
    queueMicrotask(() => api.updateSize());
  }

  // ── Station Filter ───────────────────────────────────────────────────────
  onStationFilterChange(stationId: string | null): void {
    this.selectedStationId.set(stationId);
  }

  // ── Booking Details Drawer ───────────────────────────────────────────────
  openBookingDetails(booking: Booking): void {
    this.selectedBooking.set(booking);
    this.showBookingDetails.set(true);
  }

  closeBookingDetails(): void {
    this.showBookingDetails.set(false);
    this.selectedBooking.set(null);
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  confirmBooking(): void {
    const booking = this.selectedBooking();
    if (!booking) return;

    this.salonService.confirmBooking(booking._id).subscribe({
      next: (updated) => {
        this.bookings.update((prev) =>
          prev.map((b) => (b._id === booking._id ? updated : b)),
        );
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Booking confirmed' });
        this.closeBookingDetails();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to confirm booking' });
      },
    });
  }

  markComplete(): void {
    const booking = this.selectedBooking();
    if (!booking) return;

    this.salonService.completeBooking(booking._id).subscribe({
      next: (updated) => {
        this.bookings.update((prev) =>
          prev.map((b) => (b._id === booking._id ? updated : b)),
        );
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Booking completed' });
        this.closeBookingDetails();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to complete booking' });
      },
    });
  }

  markNoShow(): void {
    const booking = this.selectedBooking();
    if (!booking) return;

    this.salonService.cancelBooking(booking._id, 'No show').subscribe({
      next: (updated) => {
        this.bookings.update((prev) =>
          prev.map((b) => (b._id === booking._id ? updated : b)),
        );
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Marked as no-show' });
        this.closeBookingDetails();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update booking' });
      },
    });
  }

  reassignStation(stationId: string): void {
    const booking = this.selectedBooking();
    if (!booking || !this.salonId) return;

    this.salonService.assignStation(this.salonId, booking._id, stationId).subscribe({
      next: (updated) => {
        this.bookings.update((prev) =>
          prev.map((b) => (b._id === booking._id ? updated : b)),
        );
        this.selectedBooking.set(updated);
        const station = this.stations().find((s) => s._id === stationId);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Reassigned to ${station?.name ?? 'station'}`,
        });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to reassign station' });
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  getStylistName(stylistId: string): string {
    return this.stylistNameMap().get(stylistId) ?? 'Unknown Stylist';
  }

  getBreakSeverity(type: string): 'warn' | 'info' | 'secondary' | 'contrast' {
    switch (type) {
      case 'LUNCH':    return 'warn';
      case 'COFFEE':   return 'info';
      case 'PERSONAL': return 'secondary';
      default:         return 'contrast';
    }
  }

  getBreakIcon(type: string): string {
    switch (type) {
      case 'LUNCH':    return 'pi pi-sun';
      case 'COFFEE':   return 'pi pi-coffee-cup';
      case 'PERSONAL': return 'pi pi-user';
      default:         return 'pi pi-clock';
    }
  }

  breakTypeLabel(type: string): string {
    switch (type) {
      case 'LUNCH':    return 'Lunch';
      case 'COFFEE':   return 'Coffee';
      case 'PERSONAL': return 'Personal';
      default:         return 'Break';
    }
  }

  getBreakRowSpan(brk: StylistBreakDto): number {
    const [sh, sm] = brk.startTime.split(':').map(Number);
    const [eh, em] = brk.endTime.split(':').map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(1, Math.ceil(duration / 30));
  }

  // ── Slot Click (empty calendar cell) → open Create Appointment dialog ────
  onEmptySlotClick(time: string, station: { _id: string; name: string }): void {
    this.createAppointmentContext.set({
      time,
      stationId: station._id,
      stationName: station.name,
      date: this.selectedDate(),
    });
    this.showCreateDialog.set(true);
  }

  onAppointmentCreated(): void {
    this.loadData();
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Appointment created successfully',
    });
  }

  getStatusSeverity(status: BookingStatus): TagSeverity {
    const severityMap: Record<BookingStatus, TagSeverity> = {
      PENDING: 'warn',
      CONFIRMED: 'info',
      IN_PROGRESS: 'secondary',
      COMPLETED: 'success',
      CANCELLED: 'danger',
      NO_SHOW: 'danger',
    };
    return severityMap[status] || 'secondary';
  }

  previousDay(): void {
    const date = new Date(this.selectedDate());
    date.setDate(date.getDate() - 1);
    this.selectedDate.set(date);
    this.loadData();
  }

  nextDay(): void {
    const date = new Date(this.selectedDate());
    date.setDate(date.getDate() + 1);
    this.selectedDate.set(date);
    this.loadData();
  }

  today(): void {
    this.selectedDate.set(new Date());
    this.loadData();
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getBookingDuration(booking: Booking): number {
    return booking.services.reduce((sum, s) => sum + s.durationMinutes, 0);
  }

  getBookingRowSpan(booking: Booking): number {
    const duration = this.getBookingDuration(booking);
    return Math.ceil(duration / 30);
  }

  private _fmtDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

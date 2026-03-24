import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { Tooltip } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import { Booking, BookingStatus } from '@org/models';
import {
  UserService,
  SalonAdminService,
  StylistBreakDto,
  CreateStylistBreakPayload,
  BreakType,
  RealtimeNotificationService,
} from '@org/shared-data-access';
import { CalendarGridComponent, CalendarColumn } from '@org/shared-ui';

type ViewMode = 'day' | 'week' | 'month' | 'list';
type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/** Virtual "booking" entry representing a break in the calendar grid */
interface BreakEntry {
  _id: string;
  isBreak: true;
  type: BreakType;
  note: string;
  startTime: string;
  endTime: string;
}

type CalendarEntry = (Booking & { isBreak?: false }) | BreakEntry;

@Component({
  selector: 'lib-stylist-appointments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    FloatLabelModule,
    InputTextModule,
    Tooltip,
    CalendarGridComponent,
    FullCalendarModule,
  ],
  providers: [MessageService],
  templateUrl: './stylist-appointments.component.html',
  styleUrl: './stylist-appointments.component.scss',
})
export class StylistAppointmentsComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly adminService = inject(SalonAdminService);
  private readonly messageService = inject(MessageService);
  private readonly realtimeSvc = inject(RealtimeNotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  // ── State ────────────────────────────────────────────────────────────────
  viewMode = signal<ViewMode>('day');
  bookings = signal<Booking[]>([]);
  breaks = signal<StylistBreakDto[]>([]);
  selectedBooking = signal<Booking | null>(null);
  showBookingDetails = signal(false);
  loading = signal(false);
  selectedDate = signal(new Date());

  // Break dialog
  showBreakDialog = signal(false);
  confirmInFlight = signal<string | null>(null);
  breakForm = {
    startTime: '',
    endTime: '',
    type: 'LUNCH' as BreakType,
    note: '',
  };
  breakSaving = signal(false);

  // First accepted salon (used for salonId when creating breaks)
  private salonId = '';

  // View options
  viewOptions = [
    { label: 'Day', value: 'day', icon: 'pi pi-calendar' },
    { label: 'Week', value: 'week', icon: 'pi pi-calendar-clock' },
    { label: 'Month', value: 'month', icon: 'pi pi-th-large' },
    { label: 'List', value: 'list', icon: 'pi pi-list' },
  ];

  breakTypeOptions: { label: string; value: BreakType }[] = [
    { label: 'Lunch Break', value: 'LUNCH' },
    { label: 'Coffee Break', value: 'COFFEE' },
    { label: 'Personal', value: 'PERSONAL' },
    { label: 'Other', value: 'OTHER' },
  ];

  // Single column for stylist view
  gridColumns: CalendarColumn[] = [{ id: 'schedule', name: 'Schedule' }];

  // ── Filtered bookings for selected date ──────────────────────────────────
  filteredBookings = computed(() => {
    const dateStr = this._fmtDate(this.selectedDate());
    return this.bookings().filter((b) => b.appointmentDate === dateStr);
  });

  // ── Calendar grid — time slots with bookings and breaks ──────────────────
  calendarGrid = computed(() => {
    const bookings = this.filteredBookings();
    const dayBreaks = this.breaks();

    // Time slots 8 AM to 8 PM in 30-min intervals
    const timeSlots: string[] = [];
    for (let hour = 8; hour < 20; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }

    const grid: { [time: string]: { schedule: CalendarEntry | null } } = {};

    timeSlots.forEach((time) => {
      // Check for a booking at this time
      const booking = bookings.find((b) => b.startTime === time);
      if (booking) {
        grid[time] = { schedule: { ...booking, isBreak: false } };
        return;
      }

      // Check for a break at this time
      const brk = dayBreaks.find((b) => b.startTime === time);
      if (brk) {
        grid[time] = {
          schedule: {
            _id: brk._id,
            isBreak: true,
            type: brk.type,
            note: brk.note,
            startTime: brk.startTime,
            endTime: brk.endTime,
          },
        };
        return;
      }

      grid[time] = { schedule: null };
    });

    return { grid, timeSlots };
  });

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
          title: `${this.breakTypeLabel(brk.type)}`,
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
            summary: `${this.breakTypeLabel(brk.type)}`,
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
    // Get accepted salons to determine salonId for breaks
    this.userService.getStylistInvitations().subscribe({
      next: (invitations) => {
        const accepted = invitations.find((inv) => inv.status === 'accepted');
        if (accepted) {
          this.salonId = accepted.salonId;
        }
      },
    });
    this.loadData();

    // ── Real-time: reload when a new booking is assigned to this stylist ──
    this.realtimeSvc.notifications$
      .pipe(
        filter(({ event }) => event === 'booking.new.stylist' || event === 'booking.new'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ data }) => {
        this.loadData();
        const d = (data ?? {}) as Record<string, unknown>;
        this.messageService.add({
          severity: 'info',
          summary: 'New Appointment',
          detail: `${d['clientName'] ?? 'A client'} booked ${d['serviceName'] ?? 'an appointment'} at ${d['startTime'] ?? ''}.`,
          life: 5000,
        });
      });
  }

  // ── Data Loading ─────────────────────────────────────────────────────────
  loadData(): void {
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

    this.userService.getStylistBookings(startDate, endDate).subscribe({
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

    this.userService.getStylistBreaks(this._fmtDate(selected)).subscribe({
      next: (data) => {
        this.breaks.set(data);
        this.cdr.markForCheck();
      },
      error: () => { /* silently handle */ },
    });
  }

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

  // ── Booking Details Drawer ───────────────────────────────────────────────
  openBookingDetails(booking: Booking): void {
    this.selectedBooking.set(booking);
    this.showBookingDetails.set(true);
  }

  closeBookingDetails(): void {
    this.showBookingDetails.set(false);
    this.selectedBooking.set(null);
  }

  // ── Calendar Slot Click — open break dialog ──────────────────────────────
  onEmptySlotClick(time: string): void {
    if (!this.salonId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No Salon',
        detail: 'Accept a salon invitation first to add breaks.',
      });
      return;
    }
    // Pre-fill the form with selected time + 30 min
    const [h, m] = time.split(':').map(Number);
    const endMinutes = h * 60 + m + 30;
    const endH = Math.floor(endMinutes / 60)
      .toString()
      .padStart(2, '0');
    const endM = (endMinutes % 60).toString().padStart(2, '0');

    this.breakForm = {
      startTime: time,
      endTime: `${endH}:${endM}`,
      type: 'LUNCH',
      note: '',
    };
    this.showBreakDialog.set(true);
  }

  // ── Break CRUD ───────────────────────────────────────────────────────────
  saveBreak(): void {
    if (!this.breakForm.startTime || !this.breakForm.endTime) return;
    this.breakSaving.set(true);

    const payload: CreateStylistBreakPayload = {
      salonId: this.salonId,
      date: this._fmtDate(this.selectedDate()),
      startTime: this.breakForm.startTime,
      endTime: this.breakForm.endTime,
      type: this.breakForm.type,
      note: this.breakForm.note || undefined,
    };

    this.userService.createStylistBreak(payload).subscribe({
      next: (created) => {
        this.breaks.update((prev) => [...prev, created]);
        this.showBreakDialog.set(false);
        this.breakSaving.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Break Added',
          detail: `${this.breakTypeLabel(created.type)} added at ${created.startTime}`,
        });
      },
      error: (err) => {
        this.breakSaving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message || 'Failed to create break',
        });
      },
    });
  }

  deleteBreak(breakId: string): void {
    this.userService.deleteStylistBreak(breakId).subscribe({
      next: () => {
        this.breaks.update((prev) => prev.filter((b) => b._id !== breakId));
        this.messageService.add({
          severity: 'success',
          summary: 'Removed',
          detail: 'Break removed',
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to remove break',
        });
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  confirmBooking(booking: Booking): void {
    this.confirmInFlight.set(booking._id);
    this.adminService.confirmBooking(booking._id).subscribe({
      next: (updated) => {
        this.bookings.update((prev) =>
          prev.map((b) => (b._id === booking._id ? updated : b)),
        );
        this.confirmInFlight.set(null);
        this.messageService.add({
          severity: 'success',
          summary:  'Approved',
          detail:   'Appointment has been confirmed.',
          life:     3500,
        });
      },
      error: () => {
        this.confirmInFlight.set(null);
        this.messageService.add({
          severity: 'error',
          summary:  'Error',
          detail:   'Could not confirm the appointment. Please try again.',
          life:     4000,
        });
      },
    });
  }

  isBreakEntry(entry: CalendarEntry): entry is BreakEntry {
    return (entry as BreakEntry).isBreak === true;
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
    return map[status] || 'secondary';
  }

  breakTypeLabel(type: BreakType): string {
    const labels: Record<BreakType, string> = {
      LUNCH: 'Lunch Break',
      COFFEE: 'Coffee Break',
      PERSONAL: 'Personal',
      OTHER: 'Other',
    };
    return labels[type] || type;
  }

  breakTypeIcon(type: BreakType): string {
    const icons: Record<BreakType, string> = {
      LUNCH: 'pi pi-sun',
      COFFEE: 'pi pi-coffee-cup',
      PERSONAL: 'pi pi-user',
      OTHER: 'pi pi-clock',
    };
    return icons[type] || 'pi pi-clock';
  }

  getBreakBgClass(type: BreakType | string): string {
    switch (type) {
      case 'LUNCH':
        return 'bg-amber-100 dark:bg-amber-900/60 border-l-amber-400 dark:border-l-amber-400 text-amber-800 dark:text-amber-100';
      case 'COFFEE':
        return 'bg-amber-200 dark:bg-yellow-900/60 border-l-amber-700 dark:border-l-amber-500 text-amber-900 dark:text-amber-100';
      case 'PERSONAL':
        return 'bg-violet-100 dark:bg-violet-900/60 border-l-violet-500 dark:border-l-violet-400 text-violet-800 dark:text-violet-100';
      default:
        return 'bg-zinc-200 dark:bg-zinc-700 border-l-zinc-400 dark:border-l-zinc-400 text-zinc-800 dark:text-zinc-100';
    }
  }

  getBookingDuration(booking: Booking): number {
    return booking.services.reduce((sum, s) => sum + s.durationMinutes, 0);
  }

  getBookingRowSpan(booking: Booking): number {
    return Math.ceil(this.getBookingDuration(booking) / 30);
  }

  getBreakRowSpan(brk: BreakEntry): number {
    const [sh, sm] = brk.startTime.split(':').map(Number);
    const [eh, em] = brk.endTime.split(':').map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(1, Math.ceil(duration / 30));
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

  _fmtDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

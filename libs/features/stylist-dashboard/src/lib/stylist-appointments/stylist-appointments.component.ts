import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
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
import { MessageService } from 'primeng/api';

import { Booking, BookingStatus } from '@org/models';
import {
  UserService,
  StylistBreakDto,
  CreateStylistBreakPayload,
  BreakType,
  RealtimeNotificationService,
} from '@org/shared-data-access';
import { CalendarGridComponent, CalendarColumn } from '@org/shared-ui';

type ViewMode = 'calendar' | 'list';
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
    CalendarGridComponent,
  ],
  providers: [MessageService],
  templateUrl: './stylist-appointments.component.html',
  styleUrl: './stylist-appointments.component.scss',
})
export class StylistAppointmentsComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly messageService = inject(MessageService);
  private readonly realtimeSvc = inject(RealtimeNotificationService);
  private readonly destroyRef = inject(DestroyRef);

  // ── State ────────────────────────────────────────────────────────────────
  viewMode = signal<ViewMode>('calendar');
  bookings = signal<Booking[]>([]);
  breaks = signal<StylistBreakDto[]>([]);
  selectedBooking = signal<Booking | null>(null);
  showBookingDetails = signal(false);
  loading = signal(false);
  selectedDate = signal(new Date());

  // Break dialog
  showBreakDialog = signal(false);
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
    { label: 'Calendar', value: 'calendar', icon: 'pi pi-calendar' },
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
    const dateStr = this._fmtDate(this.selectedDate());

    this.userService.getStylistBookings(dateStr, dateStr).subscribe({
      next: (data) => {
        this.bookings.set(data);
        this.loading.set(false);
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

    this.userService.getStylistBreaks(dateStr).subscribe({
      next: (data) => this.breaks.set(data),
      error: () => { /* silently handle */ },
    });
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

import { Component, DestroyRef, OnInit, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
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
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { Booking, BookingStatus } from '@org/models';
import { SalonAdminService, Station, SalonStaffMember, AppCurrencyPipe, RealtimeNotificationService } from '@org/shared-data-access';
import type { StylistBreakDto, BreakType } from '@org/shared-data-access';
import { CalendarGridComponent, CalendarColumn } from '@org/shared-ui';

type ViewMode = 'calendar' | 'list';
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
  ],
  providers: [MessageService],
  templateUrl: './appointments.component.html',
  styleUrl: './appointments.component.scss',
})
export class AppointmentsComponent implements OnInit {
  private readonly salonService = inject(SalonAdminService);
  private readonly messageService = inject(MessageService);
  private readonly realtimeSvc = inject(RealtimeNotificationService);
  private readonly destroyRef = inject(DestroyRef);

  // ── State ────────────────────────────────────────────────────────────────
  viewMode = signal<ViewMode>('calendar');
  bookings = signal<Booking[]>([]);
  breaks = signal<StylistBreakDto[]>([]);
  staffMembers = signal<SalonStaffMember[]>([]);
  stations = signal<Station[]>([]);
  selectedBooking = signal<Booking | null>(null);
  showBookingDetails = signal(false);
  loading = signal(false);
  selectedDate = signal(new Date());
  selectedStationId = signal<string | null>(null);
  private salonId = '';

  // Slot click state
  selectedSlot = signal<{ time: string; stationId: string; stationName: string } | null>(null);
  showSlotDialog = signal(false);

  // View options
  viewOptions = [
    { label: 'Calendar', value: 'calendar', icon: 'pi pi-calendar' },
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

    // Show only selected station, or all active stations
    const stations = stationId
      ? this.activeStations().filter((s) => s._id === stationId)
      : this.activeStations();

    // Time slots from 9 AM to 6 PM in 30-min intervals
    const timeSlots: string[] = [];
    for (let hour = 9; hour < 18; hour++) {
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

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loading.set(true);
    this.salonService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this.loadBookings();
        this.loadStations();
        this.loadStaff();
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

    // ── Real-time: reload bookings and breaks on new incoming events ──────
    this.realtimeSvc.notifications$
      .pipe(
        filter(({ event }) => event === 'booking.new' || event === 'booking.created'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.salonId) {
          this.loadBookings();
        }
      });
  }

  // ── Data Loading ─────────────────────────────────────────────────────────
  loadBookings(): void {
    if (!this.salonId) return;
    this.loading.set(true);

    const date = this.selectedDate();
    const dateStr = this._fmtDate(date);

    this.salonService.getBookingsByRange(this.salonId, dateStr, dateStr).subscribe({
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

    this.loadBreaks(dateStr);
  }

  loadBreaks(dateStr?: string): void {
    if (!this.salonId) return;
    const date = dateStr ?? this._fmtDate(this.selectedDate());
    this.salonService.getSalonStylistBreaks(this.salonId, date).subscribe({
      next: (data) => this.breaks.set(data),
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

  // ── Slot Click (empty calendar cell) ─────────────────────────────────────
  onEmptySlotClick(time: string, station: { _id: string; name: string }): void {
    this.selectedSlot.set({ time, stationId: station._id, stationName: station.name });
    this.showSlotDialog.set(true);
  }

  getSlotEndTime(startTime: string): string {
    const [h, m] = startTime.split(':').map(Number);
    const endMin = h * 60 + m + 30;
    return `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;
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
    this.loadBookings();
  }

  nextDay(): void {
    const date = new Date(this.selectedDate());
    date.setDate(date.getDate() + 1);
    this.selectedDate.set(date);
    this.loadBookings();
  }

  today(): void {
    this.selectedDate.set(new Date());
    this.loadBookings();
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

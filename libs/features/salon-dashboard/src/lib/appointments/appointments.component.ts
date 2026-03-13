import { Component, OnInit, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Button } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Drawer } from 'primeng/drawer';
import { Select } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { Toolbar } from 'primeng/toolbar';
import { SelectButton } from 'primeng/selectbutton';
import { MessageService } from 'primeng/api';

import { Booking, BookingStatus } from '@org/models';
import { SalonAdminService, Station } from '@org/shared-data-access';

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
  ],
  providers: [MessageService],
  templateUrl: './appointments.component.html',
  styleUrl: './appointments.component.scss',
})
export class AppointmentsComponent implements OnInit {
  private readonly salonService = inject(SalonAdminService);
  private readonly messageService = inject(MessageService);

  // ── State ────────────────────────────────────────────────────────────────
  viewMode = signal<ViewMode>('calendar');
  bookings = signal<Booking[]>([]);
  stations = signal<Station[]>([]);
  selectedBooking = signal<Booking | null>(null);
  showBookingDetails = signal(false);
  loading = signal(false);
  selectedDate = signal(new Date());
  selectedStationId = signal<string | null>(null);
  private salonId = '';

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

  // ── Active stations for grid + dropdowns ─────────────────────────────────
  activeStations = computed(() => this.stations().filter((s) => s.isActive));

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

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loading.set(true);
    this.salonService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this.loadBookings();
        this.loadStations();
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

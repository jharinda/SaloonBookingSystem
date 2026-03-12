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
import { SalonAdminService } from '@org/shared-data-access';

interface Station {
  _id: string;
  name: string;
  status: 'active' | 'inactive';
}

interface Staff {
  _id: string;
  name: string;
  specialties: string[];
}

interface BookingWithStation extends Booking {
  stationId?: string;
  stationName?: string;
}

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
    SelectButton
  ],
  providers: [MessageService],
  templateUrl: './appointments.component.html',
  styleUrl: './appointments.component.scss'
})
export class AppointmentsComponent implements OnInit {
  private readonly salonService = inject(SalonAdminService);
  private readonly messageService = inject(MessageService);

  // Signals
  viewMode = signal<ViewMode>('calendar');
  bookings = signal<BookingWithStation[]>([]);
  stations = signal<Station[]>([]);
  staff = signal<Staff[]>([]);
  selectedBooking = signal<BookingWithStation | null>(null);
  showBookingDetails = signal(false);
  loading = signal(false);
  selectedDate = signal(new Date());

  // View options
  viewOptions = [
    { label: 'Calendar', value: 'calendar', icon: 'pi pi-calendar' },
    { label: 'List', value: 'list', icon: 'pi pi-list' }
  ];

  // Computed
  filteredBookings = computed(() => {
    const bookings = this.bookings();
    const selectedDate = this.selectedDate();
    const dateStr = selectedDate.toISOString().split('T')[0];

    return bookings.filter(b => b.appointmentDate === dateStr);
  });

  // Active stations for dropdowns
  activeStations = computed(() => this.stations().filter(s => s.status === 'active'));

  // Calendar grid data - organized by station and time
  calendarGrid = computed(() => {
    const bookings = this.filteredBookings();
    const stations = this.stations().filter(s => s.status === 'active');

    // Time slots from 9 AM to 6 PM in 30-min intervals
    const timeSlots: string[] = [];
    for (let hour = 9; hour < 18; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }

    const grid: { [time: string]: { [stationId: string]: BookingWithStation | null } } = {};

    timeSlots.forEach(time => {
      grid[time] = {};
      stations.forEach(station => {
        const booking = bookings.find(
          b => b.stationId === station._id && b.startTime === time
        );
        grid[time][station._id] = booking || null;
      });
    });

    return { grid, timeSlots, stations };
  });

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.loadBookings(),
        this.loadStations(),
        this.loadStaff()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load appointments data'
      });
    } finally {
      this.loading.set(false);
    }
  }

  async loadBookings(): Promise<void> {
    // Mock data - replace with actual API call
    const mockBookings: BookingWithStation[] = [
      {
        _id: '1',
        clientId: 'c1',
        clientName: 'Sarah Johnson',
        salonId: 's1',
        salonName: 'Luxury Salon',
        serviceName: 'Haircut & Color',
        stylistName: 'Emma Wilson',
        services: [{ serviceId: 'sv1', name: 'Haircut & Color', price: 5000, durationMinutes: 90 }],
        appointmentDate: new Date().toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '11:30',
        totalPrice: 5000,
        status: 'CONFIRMED',
        stationId: 'st1',
        stationName: 'Station 1',
        createdAt: new Date().toISOString()
      },
      {
        _id: '2',
        clientId: 'c2',
        clientName: 'Mike Davis',
        salonId: 's1',
        salonName: 'Luxury Salon',
        serviceName: 'Beard Trim',
        stylistName: 'John Smith',
        services: [{ serviceId: 'sv2', name: 'Beard Trim', price: 1500, durationMinutes: 30 }],
        appointmentDate: new Date().toISOString().split('T')[0],
        startTime: '14:00',
        endTime: '14:30',
        totalPrice: 1500,
        status: 'PENDING',
        stationId: 'st2',
        stationName: 'Station 2',
        createdAt: new Date().toISOString()
      }
    ];

    this.bookings.set(mockBookings);
  }

  async loadStations(): Promise<void> {
    // Mock data - replace with actual API call
    const mockStations: Station[] = [
      { _id: 'st1', name: 'Station 1', status: 'active' },
      { _id: 'st2', name: 'Station 2', status: 'active' },
      { _id: 'st3', name: 'Station 3', status: 'active' }
    ];

    this.stations.set(mockStations);
  }

  async loadStaff(): Promise<void> {
    // Mock data - replace with actual API call
    const mockStaff: Staff[] = [
      { _id: 'staff1', name: 'Emma Wilson', specialties: ['Hair Coloring', 'Styling'] },
      { _id: 'staff2', name: 'John Smith', specialties: ['Barbering', 'Beard Care'] },
      { _id: 'staff3', name: 'Lisa Chen', specialties: ['Nails', 'Manicure'] }
    ];

    this.staff.set(mockStaff);
  }

  openBookingDetails(booking: BookingWithStation): void {
    this.selectedBooking.set(booking);
    this.showBookingDetails.set(true);
  }

  closeBookingDetails(): void {
    this.showBookingDetails.set(false);
    this.selectedBooking.set(null);
  }

  async confirmBooking(): Promise<void> {
    await this.updateBookingStatus('CONFIRMED');
  }

  async markComplete(): Promise<void> {
    await this.updateBookingStatus('COMPLETED');
  }

  async markNoShow(): Promise<void> {
    await this.updateBookingStatus('NO_SHOW');
  }

  async updateBookingStatus(status: BookingStatus): Promise<void> {
    const booking = this.selectedBooking();
    if (!booking) return;

    try {
      // Mock API call - replace with actual service call
      // await this.salonService.updateBookingStatus(booking._id, status);

      this.bookings.update(bookings =>
        bookings.map(b =>
          b._id === booking._id ? { ...b, status } : b
        )
      );

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `Booking ${status.toLowerCase()}`
      });

      this.closeBookingDetails();
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update booking status'
      });
    }
  }

  async reassignStation(stationId: string): Promise<void> {
    const booking = this.selectedBooking();
    if (!booking) return;

    const station = this.stations().find(s => s._id === stationId);
    if (!station) return;

    try {
      this.bookings.update(bookings =>
        bookings.map(b =>
          b._id === booking._id
            ? { ...b, stationId, stationName: station.name }
            : b
        )
      );

      this.selectedBooking.update(b => b ? { ...b, stationId, stationName: station.name } : null);

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `Reassigned to ${station.name}`
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to reassign station'
      });
    }
  }

  async reassignStylist(stylistId: string): Promise<void> {
    const booking = this.selectedBooking();
    if (!booking) return;

    const stylist = this.staff().find(s => s._id === stylistId);
    if (!stylist) return;

    try {
      this.bookings.update(bookings =>
        bookings.map(b =>
          b._id === booking._id
            ? { ...b, stylistName: stylist.name }
            : b
        )
      );

      this.selectedBooking.update(b => b ? { ...b, stylistName: stylist.name } : null);

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `Reassigned to ${stylist.name}`
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to reassign stylist'
      });
    }
  }

  getStatusSeverity(status: BookingStatus): TagSeverity {
    const severityMap: Record<BookingStatus, TagSeverity> = {
      'PENDING': 'warn',
      'CONFIRMED': 'info',
      'IN_PROGRESS': 'secondary',
      'COMPLETED': 'success',
      'CANCELLED': 'danger',
      'NO_SHOW': 'danger'
    };
    return severityMap[status] || 'secondary';
  }

  previousDay(): void {
    const date = this.selectedDate();
    date.setDate(date.getDate() - 1);
    this.selectedDate.set(new Date(date));
  }

  nextDay(): void {
    const date = this.selectedDate();
    date.setDate(date.getDate() + 1);
    this.selectedDate.set(new Date(date));
  }

  today(): void {
    this.selectedDate.set(new Date());
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  getBookingDuration(booking: BookingWithStation): number {
    return booking.services.reduce((sum, s) => sum + s.durationMinutes, 0);
  }

  getBookingRowSpan(booking: BookingWithStation): number {
    const duration = this.getBookingDuration(booking);
    return Math.ceil(duration / 30); // Each row is 30 minutes
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TranslateModule } from '@ngx-translate/core';

import { BookingStateService } from '../services/booking-state.service';
import { BookingService } from '@org/shared-data-access';
import { BookingSlot } from '@org/models';

/**
 * Step 2: Date & Time Selection
 * - Custom month calendar (no FullCalendar)
 * - Disable past dates
 * - Fetch available time slots from API on date selection (any stylist)
 * - Time slots displayed as pill buttons in 3-column mobile grid
 * - Material Design UI
 */
@Component({
  selector: 'lib-datetime-selection-step',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ButtonModule,
    ProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './datetime-selection-step.component.html',
  styleUrl: './datetime-selection-step.component.scss',
})
export class DateTimeSelectionStepComponent implements OnInit {
  private readonly bookingState = inject(BookingStateService);
  private readonly bookingService = inject(BookingService);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly salon = this.bookingState.salon;
  readonly selectedDate = this.bookingState.selectedDate;
  readonly selectedTime = this.bookingState.selectedTime;
  readonly totalDuration = this.bookingState.totalDuration;

  readonly currentMonth = signal<Date>(new Date());
  readonly availableSlots = signal<BookingSlot[]>([]);
  readonly loadingSlots = signal<boolean>(false);
  readonly slotsError = signal<string | null>(null);

  // ── Computed ─────────────────────────────────────────────────────────────────
  readonly monthLabel = computed(() => {
    const date = this.currentMonth();
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  readonly calendarDays = computed(() => {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();

    // First day of the month
    const firstDay = new Date(year, monthIndex, 1);
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Last day of the month
    const lastDay = new Date(year, monthIndex + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Build calendar grid
    const days: (Date | null)[] = [];

    // Leading empty cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, monthIndex, day));
    }

    return days;
  });

  readonly today = computed(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // If a date was previously selected, fetch slots for it
    const selectedDate = this.selectedDate();
    if (selectedDate) {
      this.fetchSlots(selectedDate);
    }
  }

  // ── Calendar Navigation ──────────────────────────────────────────────────────
  previousMonth(): void {
    const current = this.currentMonth();
    const prev = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    this.currentMonth.set(prev);
  }

  nextMonth(): void {
    const current = this.currentMonth();
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    this.currentMonth.set(next);
  }

  // ── Date Selection ───────────────────────────────────────────────────────────
  selectDate(date: Date): void {
    if (this.isDateDisabled(date)) return;

    this.bookingState.selectDate(date);
    this.fetchSlots(date);
  }

  isDateDisabled(date: Date): boolean {
    const today = this.today();
    return date < today;
  }

  isDateSelected(date: Date): boolean {
    const selected = this.selectedDate();
    if (!selected) return false;
    return (
      date.getFullYear() === selected.getFullYear() &&
      date.getMonth() === selected.getMonth() &&
      date.getDate() === selected.getDate()
    );
  }

  // ── Time Slots ───────────────────────────────────────────────────────────────
  private fetchSlots(date: Date): void {
    const salonId = this.salon()?._id;
    if (!salonId) {
      this.slotsError.set('Salon ID not found');
      return;
    }

    const duration = this.totalDuration();

    this.loadingSlots.set(true);
    this.slotsError.set(null);
    this.availableSlots.set([]);

    const dateStr = this._fmtLocalDate(date);

    this.bookingService
      .getAvailableSlots(salonId, dateStr, duration)
      .subscribe({
        next: (response) => {
          const filtered = this.filterSlots(response.slots, date);
          this.availableSlots.set(filtered);
          this.loadingSlots.set(false);
        },
        error: (err) => {
          console.error('Failed to fetch slots:', err);
          this.slotsError.set('Failed to load available time slots. Please try again.');
          this.loadingSlots.set(false);
        },
      });
  }

  /**
   * Filter out booked slots and past time slots (for today).
   */
  private filterSlots(slots: BookingSlot[], date: Date): BookingSlot[] {
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    return slots.filter((slot) => {
      // Remove booked / unavailable slots
      if (!slot.available) return false;

      // Remove past time slots when the selected date is today
      if (isToday) {
        const [hours, minutes] = slot.time.split(':').map(Number);
        const slotMinutes = hours * 60 + minutes;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (slotMinutes <= nowMinutes) return false;
      }

      return true;
    });
  }

  selectTime(time: string): void {
    this.bookingState.selectTime(time);
  }

  isTimeSelected(time: string): boolean {
    return this.selectedTime() === time;
  }

  trackByTime(_index: number, slot: BookingSlot): string {
    return slot.time;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  getDayNumber(date: Date): number {
    return date.getDate();
  }

  trackByDate(index: number, date: Date | null): string {
    return date ? date.toISOString() : `empty-${index}`;
  }

  /** Format a Date as YYYY-MM-DD using LOCAL components (avoids UTC-midnight shift). */
  private _fmtLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';

import { Booking, BookingStatus } from '@org/models';
import { BookingService } from '@org/shared-data-access';

import { AppointmentCardComponent } from './appointment-card.component';
import {
  CancelBookingDialogComponent,
  CancelDialogResult,
} from './cancel-booking-dialog.component';

// ── Types ─────────────────────────────────────────────────────────────────────

type RichBooking = Booking & { hasReview?: boolean; clientRating?: number };

const UPCOMING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];
const PAST_STATUSES: BookingStatus[]      = ['COMPLETED'];
const CANCELLED_STATUSES: BookingStatus[] = ['CANCELLED', 'NO_SHOW'];

// ── Countdown helper ──────────────────────────────────────────────────────────

function buildCountdown(targetIso: string, startTime: string): string {
  const [hStr, mStr] = startTime.split(':');
  const target = new Date(targetIso);
  target.setHours(parseInt(hStr, 10), parseInt(mStr ?? '0', 10), 0, 0);

  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'now';

  const totalMins = Math.floor(diffMs / 60_000);
  const days  = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins  = totalMins % 60;

  const parts: string[] = [];
  if (days  > 0) parts.push(`${days} day${days  !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
  if (mins  > 0 && days === 0) parts.push(`${mins} min${mins !== 1 ? 's' : ''}`);
  return parts.join(' ') || 'less than a minute';
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'lib-my-appointments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    AppointmentCardComponent,
  ],
  templateUrl: './my-appointments.component.html',
  styleUrl:    './my-appointments.component.scss',
})
export class MyAppointmentsComponent implements OnInit, OnDestroy {
  // ── DI ──────────────────────────────────────────────────────────────────────
  private readonly bookingService = inject(BookingService);
  private readonly dialog         = inject(MatDialog);
  private readonly snack          = inject(MatSnackBar);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);

  /** Raw list — mutated optimistically on cancel */
  readonly allBookings = signal<RichBooking[]>([]);

  /** Countdown string, updated every minute */
  readonly countdown = signal<string>('');

  private countdownTimer?: ReturnType<typeof setInterval>;

  // ── Derived lists ────────────────────────────────────────────────────────────
  readonly upcoming = computed(() =>
    this.allBookings()
      .filter((b) => UPCOMING_STATUSES.includes(b.status))
      .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate)),
  );

  readonly past = computed(() =>
    this.allBookings()
      .filter((b) => PAST_STATUSES.includes(b.status))
      .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate)),
  );

  readonly cancelled = computed(() =>
    this.allBookings()
      .filter((b) => CANCELLED_STATUSES.includes(b.status))
      .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate)),
  );

  /** The very next appointment (first in upcoming, sorted ASC) */
  readonly nextAppointment = computed(() => this.upcoming()[0] ?? null);

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadBookings();
  }

  ngOnDestroy(): void {
    clearInterval(this.countdownTimer);
  }

  // ── Data loading ─────────────────────────────────────────────────────────────
  protected loadBookings(): void {
    this.loading.set(true);
    this.error.set(null);

    this.bookingService.getMyBookings().subscribe({
      next: (bookings) => {
        this.allBookings.set(bookings as RichBooking[]);
        this.loading.set(false);
        this.startCountdown();
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load your appointments. Please try again.');
      },
    });
  }

  // ── Countdown timer ───────────────────────────────────────────────────────────
  private startCountdown(): void {
    clearInterval(this.countdownTimer);
    this.updateCountdown();
    this.countdownTimer = setInterval(() => this.updateCountdown(), 60_000);
  }

  private updateCountdown(): void {
    const next = this.nextAppointment();
    if (!next) return;
    this.countdown.set(buildCountdown(next.appointmentDate, next.startTime));
  }

  // ── Cancel flow ──────────────────────────────────────────────────────────────
  openCancelDialog(booking: RichBooking): void {
    const ref = this.dialog.open(CancelBookingDialogComponent, {
      width: '420px',
      data: { salonName: booking.salonName, serviceName: booking.serviceName },
    });

    ref.afterClosed().subscribe((result: CancelDialogResult | undefined) => {
      if (!result?.confirmed) return;
      this.executeCancel(booking._id, result.reason);
    });
  }

  private executeCancel(bookingId: string, reason: string): void {
    this.bookingService.cancelBooking(bookingId, reason || undefined).subscribe({
      next: (updated) => {
        // Optimistic update — replace status in the signal
        this.allBookings.update((list) =>
          list.map((b) => (b._id === updated._id ? { ...b, ...updated } : b)),
        );
        this.snack.open('Appointment cancelled.', undefined, { duration: 3000 });
        this.startCountdown(); // recalculate next appointment
      },
      error: () => {
        this.snack.open('Could not cancel — please try again.', undefined, { duration: 4000 });
      },
    });
  }
}

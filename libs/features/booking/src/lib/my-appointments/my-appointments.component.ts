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
import { Button } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';

import { Booking, BookingStatus } from '@org/models';
import { BookingService } from '@org/shared-data-access';
import { ReviewService } from '@org/shared-data-access';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AppointmentCardComponent } from './appointment-card.component';
import {
  CancelBookingDialogComponent,
  CancelDialogResult,
} from './cancel-booking-dialog.component';
import {
  WriteReviewDialogComponent,
  WriteReviewDialogResult,
} from './write-review-dialog.component';

// ── Types ─────────────────────────────────────────────────────────────────────

type RichBooking = Booking & { hasReview?: boolean; clientRating?: number };

const UPCOMING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];
const PAST_STATUSES: BookingStatus[]      = ['COMPLETED'];
const CANCELLED_STATUSES: BookingStatus[] = ['CANCELLED', 'NO_SHOW'];

// ── Time helpers ─────────────────────────────────────────────────────────────

/** Parse "YYYY-MM-DD" + "HH:mm" as a LOCAL-time Date (avoids UTC-midnight drift). */
function parseLocalDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day]   = dateStr.split('-').map(Number);
  const [hStr, mStr = '0']   = timeStr.split(':');
  return new Date(year, month - 1, day, parseInt(hStr, 10), parseInt(mStr, 10), 0, 0);
}

/** Returns true when the appointment's end time is already in the past. */
function isAppointmentOver(appointmentDate: string, endTime: string): boolean {
  return parseLocalDateTime(appointmentDate, endTime).getTime() < Date.now();
}

// ── Countdown helper ──────────────────────────────────────────────────────────

function buildCountdown(appointmentDate: string, startTime: string): string {
  const target  = parseLocalDateTime(appointmentDate, startTime);
  const diffMs  = target.getTime() - Date.now();
  if (diffMs <= 0) return 'starting now';

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
    Button,
    Skeleton,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    AppointmentCardComponent,
  ],
  templateUrl: './my-appointments.component.html',
  styleUrl:    './my-appointments.component.scss',
})
export class MyAppointmentsComponent implements OnInit, OnDestroy {
  // ── DI ──────────────────────────────────────────────────────────────────────
  private readonly bookingService = inject(BookingService);
  private readonly reviewService  = inject(ReviewService);
  private readonly dialogService  = inject(DialogService);
  private readonly msgSvc         = inject(MessageService);

  private cancelDialogRef: DynamicDialogRef | null = null;
  private reviewDialogRef: DynamicDialogRef | null = null;

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
      .filter((b) =>
        UPCOMING_STATUSES.includes(b.status) &&
        !isAppointmentOver(b.appointmentDate, b.endTime),
      )
      .sort((a, b) => {
        const tA = parseLocalDateTime(a.appointmentDate, a.startTime).getTime();
        const tB = parseLocalDateTime(b.appointmentDate, b.startTime).getTime();
        return tA - tB;
      }),
  );

  readonly past = computed(() =>
    this.allBookings()
      .filter((b) =>
        PAST_STATUSES.includes(b.status) ||
        // Ended-but-not-yet-completed confirmed/in-progress (backend cron will catch up).
        // Expired PENDING bookings are intentionally excluded here — they go to cancelled.
        (UPCOMING_STATUSES.includes(b.status) &&
          b.status !== 'PENDING' &&
          isAppointmentOver(b.appointmentDate, b.endTime)),
      )
      .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate)),
  );

  readonly cancelled = computed(() =>
    this.allBookings()
      .filter(
        (b) =>
          CANCELLED_STATUSES.includes(b.status) ||
          // Expired PENDING: salon never confirmed the booking — treat as cancelled
          // on the client side until the backend cron catches up.
          (b.status === 'PENDING' && isAppointmentOver(b.appointmentDate, b.startTime)),
      )
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

    forkJoin({
      bookings: this.bookingService.getMyBookings(),
      // Reviews are best-effort: if the endpoint is unavailable, bookings still load.
      reviews:  this.reviewService.getMyReviews().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ bookings, reviews }) => {
        // Build a lookup: bookingId → { hasReview, rating }
        const reviewMap = new Map(
          reviews.map((r) => [r.bookingId, r.rating]),
        );
        const rich: RichBooking[] = bookings.map((b) => ({
          ...b,
          hasReview:    reviewMap.has(b._id),
          clientRating: reviewMap.get(b._id),
        }));
        this.allBookings.set(rich);
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
    this.cancelDialogRef = this.dialogService.open(CancelBookingDialogComponent, {
      header: 'Cancel Appointment',
      width: '420px',
      closable: true,
      data: { salonName: booking.salonName, serviceName: booking.serviceName },
    });

    this.cancelDialogRef?.onClose.subscribe((result: CancelDialogResult | undefined) => {
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
        this.msgSvc.add({ severity: 'success', summary: 'Done', detail: 'Appointment cancelled.', life: 3000 });
        this.startCountdown(); // recalculate next appointment
      },
      error: () => {
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Could not cancel — please try again.', life: 4000 });
      },
    });
  }

  // ── Review flow ─────────────────────────────────────────────────────────────────────
  openReviewDialog(booking: RichBooking): void {
    this.reviewDialogRef = this.dialogService.open(WriteReviewDialogComponent, {
      header: 'Leave a Review',
      width: '520px',
      closable: true,
      data: {
        bookingId:   booking._id,
        salonId:     booking.salonId,
        stylistId:   booking.stylistName ? undefined : undefined, // stylistId not on Booking model
        salonName:   booking.salonName,
        serviceName: booking.serviceName,
      },
    });

    this.reviewDialogRef?.onClose.subscribe((result: WriteReviewDialogResult | undefined) => {
      if (!result) return;
      // Optimistically mark as reviewed
      this.allBookings.update((list) =>
        list.map((b) =>
          b._id === booking._id
            ? { ...b, hasReview: true, clientRating: result.rating }
            : b,
        ),
      );
      this.msgSvc.add({ severity: 'success', summary: 'Thank you!', detail: 'Your review has been submitted.', life: 3000 });
    });
  }
}

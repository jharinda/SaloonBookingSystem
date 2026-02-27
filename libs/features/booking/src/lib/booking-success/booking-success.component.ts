import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Booking } from '@org/models';
import { BookingService } from '../services/booking.service';
import { CalendarService } from '../services/calendar.service';
import { PushNotificationDialogComponent } from './push-notification-dialog.component';

@Component({
  selector: 'lib-booking-success',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="success-container">

      <!-- Header -->
      <div class="success-banner">
        <div class="success-icon-wrapper">
          <mat-icon class="success-icon">check_circle</mat-icon>
        </div>
        <h1 class="success-title">Booking Confirmed!</h1>
        <p class="success-subtitle">
          Your appointment has been booked. You'll receive a confirmation shortly.
        </p>
      </div>

      <!-- Loading state while fetching booking details -->
      @if (isLoading()) {
        <div class="loading-state">
          <mat-spinner diameter="40" />
          <span>Loading booking details…</span>
        </div>
      }

      <!-- Error state -->
      @if (!isLoading() && loadError()) {
        <div class="error-state">
          <mat-icon color="warn">error_outline</mat-icon>
          <span>{{ loadError() }}</span>
        </div>
      }

      <!-- Booking details card -->
      @if (!isLoading() && booking()) {
        <div class="details-card">
          <h2 class="details-heading">Appointment Details</h2>

          <div class="detail-row">
            <mat-icon class="detail-icon">tag</mat-icon>
            <div>
              <div class="detail-label">Booking ID</div>
              <div class="detail-value detail-value--mono">{{ booking()!._id }}</div>
            </div>
          </div>

          <mat-divider />

          <div class="detail-row">
            <mat-icon class="detail-icon">storefront</mat-icon>
            <div>
              <div class="detail-label">Salon</div>
              <div class="detail-value">{{ booking()!.salonName }}</div>
            </div>
          </div>

          <mat-divider />

          <div class="detail-row">
            <mat-icon class="detail-icon">content_cut</mat-icon>
            <div>
              <div class="detail-label">Service</div>
              <div class="detail-value">{{ booking()!.serviceName }}</div>
            </div>
          </div>

          @if (booking()!.stylistName) {
            <mat-divider />
            <div class="detail-row">
              <mat-icon class="detail-icon">person</mat-icon>
              <div>
                <div class="detail-label">Stylist</div>
                <div class="detail-value">{{ booking()!.stylistName }}</div>
              </div>
            </div>
          }

          <mat-divider />

          <div class="detail-row">
            <mat-icon class="detail-icon">event</mat-icon>
            <div>
              <div class="detail-label">Date</div>
              <div class="detail-value">
                {{ booking()!.appointmentDate | date: 'fullDate' }}
              </div>
            </div>
          </div>

          <mat-divider />

          <div class="detail-row">
            <mat-icon class="detail-icon">schedule</mat-icon>
            <div>
              <div class="detail-label">Time</div>
              <div class="detail-value">
                {{ booking()!.startTime }} – {{ booking()!.endTime }}
              </div>
            </div>
          </div>

          <mat-divider />

          <div class="detail-row">
            <mat-icon class="detail-icon">payments</mat-icon>
            <div>
              <div class="detail-label">Total</div>
              <div class="detail-value detail-value--price">
                LKR {{ booking()!.totalPrice | number }}
              </div>
            </div>
          </div>

          <div class="status-chip" [class]="'status-chip--' + booking()!.status.toLowerCase()">
            {{ booking()!.status }}
          </div>
        </div>

        <!-- Calendar actions -->
        <div class="calendar-section">
          <h3 class="calendar-heading">
            <mat-icon>calendar_month</mat-icon>
            Add to your calendar
          </h3>

          <div class="calendar-buttons">
            <button
              mat-raised-button
              color="primary"
              [disabled]="isCalendarLoading()"
              (click)="addToGoogleCalendar()"
              matTooltip="Syncs with your Google Calendar account"
            >
              @if (isCalendarLoading()) {
                <mat-spinner diameter="18" class="btn-spinner" />
              } @else {
                <mat-icon>event_available</mat-icon>
              }
              Add to Google Calendar
            </button>

            <button
              mat-stroked-button
              [disabled]="isIcsLoading()"
              (click)="downloadIcs()"
              matTooltip="Download an .ics file for Apple Calendar, Outlook, etc."
            >
              @if (isIcsLoading()) {
                <mat-spinner diameter="18" class="btn-spinner" />
              } @else {
                <mat-icon>download</mat-icon>
              }
              Download .ics File
            </button>
          </div>
        </div>

        <!-- Navigation -->
        <div class="nav-actions">
          <button mat-stroked-button (click)="goToDiscover()">
            <mat-icon>search</mat-icon>
            Find Another Salon
          </button>
          <button mat-button (click)="goToBookings()">
            <mat-icon>list_alt</mat-icon>
            My Bookings
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .success-container {
      max-width: 560px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    /* ── Banner ── */
    .success-banner {
      text-align: center;
      padding: 40px 16px 36px;
    }

    .success-icon-wrapper {
      display: inline-flex;
      background: #dcfce7;
      border-radius: 50%;
      padding: 16px;
      margin-bottom: 16px;
    }

    .success-icon {
      font-size: 3rem;
      width: 3rem;
      height: 3rem;
      color: #16a34a;
    }

    .success-title {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 10px;
      color: #111827;
    }

    .success-subtitle {
      font-size: 0.97rem;
      color: #6b7280;
      max-width: 380px;
      margin: 0 auto;
      line-height: 1.6;
    }

    /* ── Loading / Error ── */
    .loading-state, .error-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px;
      color: #6b7280;
      font-size: 0.9rem;
    }

    .error-state { color: #ef4444; }

    /* ── Details card ── */
    .details-card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      margin-bottom: 28px;
      padding-bottom: 16px;
    }

    .details-heading {
      font-size: 1rem;
      font-weight: 600;
      padding: 18px 18px 12px;
      margin: 0;
      color: #374151;
    }

    .detail-row {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 14px 18px;
    }

    .detail-icon {
      color: var(--mat-sys-primary, #6750A4);
      font-size: 1.2rem;
      width: 1.2rem;
      height: 1.2rem;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .detail-label {
      font-size: 0.73rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9ca3af;
      font-weight: 500;
      margin-bottom: 2px;
    }

    .detail-value {
      font-size: 0.93rem;
      font-weight: 500;
      color: #111827;
    }

    .detail-value--mono { font-family: monospace; font-size: 0.82rem; color: #6b7280; }

    .detail-value--price {
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--mat-sys-primary, #6750A4);
    }

    .status-chip {
      display: inline-block;
      margin: 8px 18px 0;
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-chip--pending    { background: #fef9c3; color: #a16207; }
    .status-chip--confirmed  { background: #dcfce7; color: #166534; }
    .status-chip--cancelled  { background: #fee2e2; color: #991b1b; }
    .status-chip--completed  { background: #ede9fe; color: #5b21b6; }

    /* ── Calendar section ── */
    .calendar-section {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }

    .calendar-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.93rem;
      font-weight: 600;
      color: #374151;
      margin: 0 0 16px;
    }

    .calendar-heading mat-icon {
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
      color: var(--mat-sys-primary, #6750A4);
    }

    .calendar-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .btn-spinner {
      display: inline-block;
      vertical-align: middle;
      margin-right: 6px;
    }

    /* ── Nav ── */
    .nav-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    @media (max-width: 480px) {
      .success-container { padding: 20px 16px 40px; }
      .calendar-buttons { flex-direction: column; }
      .calendar-buttons button { width: 100%; }
    }
  `],
})
export class BookingSuccessComponent implements OnInit {
  private readonly route           = inject(ActivatedRoute);
  private readonly bookingService  = inject(BookingService);
  private readonly calendarService = inject(CalendarService);
  private readonly snackBar        = inject(MatSnackBar);
  private readonly router          = inject(Router);
  private readonly dialog          = inject(MatDialog);

  private get bookingId(): string {
    return this.route.snapshot.paramMap.get('bookingId') ?? '';
  }

  readonly booking           = signal<Booking | null>(null);
  readonly isLoading         = signal(true);
  readonly loadError         = signal<string | null>(null);
  readonly isCalendarLoading = signal(false);
  readonly isIcsLoading      = signal(false);

  ngOnInit(): void {
    this.bookingService.getById(this.bookingId).subscribe({
      next: (b) => {
        this.booking.set(b);
        this.isLoading.set(false);
        this.maybePromptPushNotifications();
      },
      error: () => {
        this.loadError.set('Could not load booking details.');
        this.isLoading.set(false);
      },
    });
  }

  /** Open the push-notification opt-in dialog (once per browser session). */
  private maybePromptPushNotifications(): void {
    if (sessionStorage.getItem('pn_prompted')) return;
    if ('Notification' in window && Notification.permission !== 'default') return;

    sessionStorage.setItem('pn_prompted', '1');
    setTimeout(() => {
      this.dialog.open(PushNotificationDialogComponent, {
        width: '380px',
        panelClass: 'pwa-dialog-panel',
        disableClose: false,
      });
    }, 800);
  }

  addToGoogleCalendar(): void {
    this.isCalendarLoading.set(true);
    this.calendarService.getGoogleAuthUrl().subscribe({
      next: (res) => {
        window.location.href = res.url;
      },
      error: () => {
        this.isCalendarLoading.set(false);
        this.snackBar.open('Could not connect to Google Calendar. Please try again.', 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  downloadIcs(): void {
    this.isIcsLoading.set(true);
    this.calendarService.downloadIcs(this.bookingId).subscribe({
      next: (blob) => {
        triggerBlobDownload(blob, `snapsalon-booking-${this.bookingId}.ics`);
        this.isIcsLoading.set(false);
      },
      error: () => {
        this.isIcsLoading.set(false);
        this.snackBar.open('Could not download calendar file. Please try again.', 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  goToDiscover(): void {
    void this.router.navigate(['/discover']);
  }

  goToBookings(): void {
    void this.router.navigate(['/my-bookings']);
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Booking, BookingStatus } from '@org/models';

export type AppointmentTab = 'upcoming' | 'past' | 'cancelled';

/** Config for the status badge */
const STATUS_CONFIG: Record<BookingStatus, { label: string; css: string }> = {
  PENDING:     { label: 'Pending',     css: 'badge--pending'     },
  CONFIRMED:   { label: 'Confirmed',   css: 'badge--confirmed'   },
  IN_PROGRESS: { label: 'In Progress', css: 'badge--in-progress' },
  COMPLETED:   { label: 'Completed',   css: 'badge--completed'   },
  CANCELLED:   { label: 'Cancelled',   css: 'badge--cancelled'   },
  NO_SHOW:     { label: 'No Show',     css: 'badge--cancelled'   },
};

function buildStars(rating: number): ('full' | 'half' | 'empty')[] {
  const r = Math.max(0, Math.min(5, rating));
  return Array.from({ length: 5 }, (_, i) => {
    const d = r - i;
    if (d >= 0.75) return 'full';
    if (d >= 0.25) return 'half';
    return 'empty';
  });
}

@Component({
  selector: 'lib-appointment-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <article class="appt-card" [class.appt-card--cancelled]="tab() === 'cancelled'">

      <!-- Thumbnail -->
      <div class="appt-thumb" aria-hidden="true">
        <mat-icon class="appt-thumb__icon">content_cut</mat-icon>
      </div>

      <!-- Details -->
      <div class="appt-body">
        <div class="appt-body__top">
          <div>
            <h3 class="appt-name">{{ booking().salonName }}</h3>
            <p class="appt-service">{{ booking().serviceName }}</p>
            @if (booking().stylistName) {
              <p class="appt-stylist">
                <mat-icon class="inline-icon" aria-hidden="true">person</mat-icon>
                {{ booking().stylistName }}
              </p>
            }
          </div>

          <!-- Status badge -->
          <span
            class="appt-badge"
            [class]="'appt-badge ' + statusCss()"
            [attr.aria-label]="'Status: ' + statusLabel()"
          >{{ statusLabel() }}</span>
        </div>

        <!-- Date / time row -->
        <div class="appt-datetime">
          <mat-icon class="inline-icon" aria-hidden="true">calendar_today</mat-icon>
          <time [attr.datetime]="booking().appointmentDate">
            {{ booking().appointmentDate | date: 'EEEE, d MMMM yyyy' }}
            at {{ booking().startTime }}
          </time>
        </div>

        <!-- Duration & price -->
        <div class="appt-meta">
          <span>
            <mat-icon class="inline-icon-sm" aria-hidden="true">schedule</mat-icon>
            {{ booking().startTime }} – {{ booking().endTime }}
          </span>
          <span class="appt-price">LKR {{ booking().totalPrice | number }}</span>
        </div>

        <!-- Existing review (past tab only) -->
        @if (tab() === 'past' && booking().clientRating) {
          <div
            class="appt-review-stars"
            [attr.aria-label]="'You rated this ' + booking().clientRating + ' stars'"
          >
            @for (star of stars(); track $index) {
              <mat-icon
                class="star-icon"
                [class.star--full]="star === 'full'"
                [class.star--half]="star === 'half'"
                [class.star--empty]="star === 'empty'"
                aria-hidden="true"
              >
                {{ star === 'full' ? 'star' : star === 'half' ? 'star_half' : 'star_border' }}
              </mat-icon>
            }
            <span class="appt-review-label">Your review</span>
          </div>
        }

        <!-- Actions -->
        <div class="appt-actions">

          @if (tab() === 'upcoming') {
            <button
              mat-stroked-button
              class="action-btn"
              (click)="getDirections()"
              aria-label="Get directions to {{ booking().salonName }}"
            >
              <mat-icon>directions</mat-icon>
              Get Directions
            </button>
            <button
              mat-stroked-button
              class="action-btn action-btn--danger"
              (click)="cancelRequested.emit()"
              aria-label="Cancel this appointment"
            >
              <mat-icon>cancel</mat-icon>
              Cancel
            </button>
          }

          @if (tab() === 'past') {
            @if (!booking().hasReview) {
              <button
                mat-flat-button
                class="action-btn action-btn--primary"
                (click)="leaveReview()"
                aria-label="Leave a review for this booking"
              >
                <mat-icon>rate_review</mat-icon>
                Leave a Review
              </button>
            }
            <button
              mat-stroked-button
              class="action-btn"
              (click)="bookAgain()"
              aria-label="Book this salon again"
            >
              <mat-icon>replay</mat-icon>
              Book Again
            </button>
          }

        </div>
      </div>
    </article>
  `,
  styles: [`
    .appt-card {
      display: flex;
      gap: 16px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
      transition: box-shadow .2s;

      &:hover { box-shadow: 0 4px 16px rgba(0,0,0,.07); }
      &--cancelled { opacity: .75; }
    }

    .appt-thumb {
      flex-shrink: 0;
      width: 80px;
      height: 80px;
      border-radius: 10px;
      background: #f5f3ff;
      display: flex;
      align-items: center;
      justify-content: center;

      &__icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
        color: #6750a4;
        opacity: .6;
      }
    }

    .appt-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .appt-body__top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .appt-name {
      font-size: 1rem;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 2px;
      line-height: 1.3;
    }

    .appt-service {
      font-size: .875rem;
      color: #6b7280;
      margin: 0;
    }

    .appt-stylist {
      display: flex;
      align-items: center;
      font-size: .8rem;
      color: #9ca3af;
      margin: 2px 0 0;
    }

    .appt-badge {
      flex-shrink: 0;
      font-size: .7rem;
      font-weight: 700;
      border-radius: 20px;
      padding: 3px 10px;
      white-space: nowrap;
    }

    .badge--pending     { background: #fef9c3; color: #92400e; }
    .badge--confirmed   { background: #dcfce7; color: #166534; }
    .badge--in-progress { background: #dbeafe; color: #1e40af; }
    .badge--completed   { background: #e0e7ff; color: #3730a3; }
    .badge--cancelled   { background: #fee2e2; color: #991b1b; }

    .appt-datetime {
      display: flex;
      align-items: center;
      font-size: .875rem;
      color: #374151;
      gap: 4px;
    }

    .appt-meta {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: .82rem;
      color: #9ca3af;

      span { display: flex; align-items: center; gap: 3px; }
    }

    .appt-price {
      font-weight: 700;
      color: #1f2937;
      font-size: .9rem !important;
    }

    .appt-review-stars {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .appt-review-label {
      font-size: .78rem;
      color: #9ca3af;
      margin-left: 6px;
    }

    .star-icon {
      font-size: 16px; width: 16px; height: 16px;
      &.star--full, &.star--half { color: #f59e0b; }
      &.star--empty { color: #d1d5db; }
    }

    .appt-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }

    .action-btn {
      font-size: .8rem;
      border-radius: 20px;
      height: 34px;
      padding: 0 14px;
      display: flex;
      align-items: center;
      gap: 4px;

      mat-icon { font-size: 16px; width: 16px; height: 16px; }

      &--primary {
        background: #6750a4;
        color: #fff;
      }
      &--danger {
        border-color: #dc2626;
        color: #dc2626;
      }
    }

    .inline-icon {
      font-size: 15px; width: 15px; height: 15px;
      vertical-align: middle; margin-right: 3px; opacity: .65;
    }
    .inline-icon-sm {
      font-size: 13px; width: 13px; height: 13px;
      vertical-align: middle; margin-right: 2px;
    }
  `],
})
export class AppointmentCardComponent {
  readonly booking = input.required<Booking & { hasReview?: boolean; clientRating?: number }>();
  readonly tab = input.required<AppointmentTab>();

  /** Emitted when the user requests cancellation (parent opens dialog). */
  readonly cancelRequested = output<void>();

  private readonly router = inject(Router);

  // ── Derived ────────────────────────────────────────────────────────────────
  statusLabel(): string {
    return STATUS_CONFIG[this.booking().status]?.label ?? this.booking().status;
  }

  statusCss(): string {
    return STATUS_CONFIG[this.booking().status]?.css ?? '';
  }

  stars() {
    return buildStars(this.booking().clientRating ?? 0);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  getDirections(): void {
    // The Booking model has salonId but not salonAddress — use salonName for a name search.
    const query = encodeURIComponent(this.booking().salonName);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  }

  leaveReview(): void {
    void this.router.navigate(['/reviews', 'new'], {
      queryParams: { bookingId: this.booking()._id },
    });
  }

  bookAgain(): void {
    void this.router.navigate(['/booking'], {
      queryParams: { salonId: this.booking().salonId },
    });
  }
}

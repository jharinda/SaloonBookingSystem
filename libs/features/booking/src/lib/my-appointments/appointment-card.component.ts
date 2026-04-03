import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';

import { Button } from 'primeng/button';
import { TranslateModule } from '@ngx-translate/core';

import { Booking, BookingStatus } from '@org/models';
import { AppCurrencyPipe } from '@org/shared-data-access';

export type AppointmentTab = 'upcoming' | 'past' | 'cancelled';

/** Config for the status badge - only CSS class, label comes from i18n */
const STATUS_CONFIG: Record<BookingStatus, { css: string }> = {
  PENDING:     { css: 'badge--pending'     },
  CONFIRMED:   { css: 'badge--confirmed'   },
  IN_PROGRESS: { css: 'badge--in-progress' },
  COMPLETED:   { css: 'badge--completed'   },
  CANCELLED:   { css: 'badge--cancelled'   },
  NO_SHOW:     { css: 'badge--cancelled'   },
};

const MODIFIABLE_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

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
  imports: [DatePipe, Button, AppCurrencyPipe, TranslateModule],
  template: `
    <article class="appt-card" [class.appt-card--cancelled]="tab() === 'cancelled'">

      <!-- Thumbnail -->
      <div class="appt-thumb" aria-hidden="true">
        <i class="pi pi-scissors appt-thumb__icon"></i>
      </div>

      <!-- Details -->
      <div class="appt-body">
        <div class="appt-body__top">
          <div>
            <h3 class="appt-name">{{ booking().salonName }}</h3>
            <p class="appt-service">{{ booking().serviceName }}</p>
            @if (booking().stylistName) {
              <p class="appt-stylist">
                <i class="pi pi-user inline-icon" aria-hidden="true"></i>
                {{ booking().stylistName }}
              </p>
            }
          </div>

          <!-- Status badge -->
          <span
            class="appt-badge"
            [class]="'appt-badge ' + statusCss()"
            [attr.aria-label]="'Status: ' + booking().status"
          >{{ 'appointments.status.' + booking().status | translate }}</span>
        </div>

        <!-- Date / time row -->
        <div class="appt-datetime">
          <i class="pi pi-calendar inline-icon" aria-hidden="true"></i>
          <time [attr.datetime]="booking().appointmentDate">
            {{ booking().appointmentDate | date: 'EEEE, d MMMM yyyy' }}
            at {{ booking().startTime }}
          </time>
        </div>

        <!-- Duration & price -->
        <div class="appt-meta">
          <span>
            <i class="pi pi-clock inline-icon-sm" aria-hidden="true"></i>
            {{ booking().startTime }} – {{ booking().endTime }}
          </span>
          <span class="appt-price">{{ booking().totalPrice | appCurrency }}</span>
        </div>

        <!-- Existing review (past tab only) -->
        @if (tab() === 'past' && booking().clientRating) {
          <div
            class="appt-review-stars"
            [attr.aria-label]="'You rated this ' + booking().clientRating + ' stars'"
          >
            @for (star of stars(); track $index) {
              <i
                class="pi star-icon"
                [class.pi-star-fill]="star === 'full' || star === 'half'"
                [class.pi-star]="star === 'empty'"
                [class.star--full]="star === 'full'"
                [class.star--half]="star === 'half'"
                [class.star--empty]="star === 'empty'"
                aria-hidden="true"
              ></i>
            }
            <span class="appt-review-label">{{ 'appointments.yourReview' | translate }}</span>
          </div>
        }

        <!-- Actions -->
        <div class="appt-actions">

          @if (tab() === 'upcoming') {
            <p-button
              icon="pi pi-compass"
              [label]="'appointments.getDirections' | translate"
              [outlined]="true"
              size="small"
              [rounded]="true"
              (onClick)="getDirections()"
              [attr.aria-label]="'Get directions to ' + booking().salonName"
            />
            <p-button
              icon="pi pi-calendar-plus"
              [label]="'appointments.addToCalendar' | translate"
              [outlined]="true"
              size="small"
              [rounded]="true"
              (onClick)="addToCalendar()"
              aria-label="Add appointment to Google Calendar"
            />
            <p-button
              icon="pi pi-times-circle"
              [label]="'appointments.cancel' | translate"
              [outlined]="true"
              severity="danger"
              size="small"
              [rounded]="true"
              (onClick)="cancelRequested.emit()"
              aria-label="Cancel this appointment"
            />
            @if (canModify()) {
              <p-button
                icon="pi pi-pencil"
                [label]="'appointments.modify' | translate"
                [outlined]="true"
                size="small"
                [rounded]="true"
                (onClick)="modifyRequested.emit()"
                aria-label="Modify services on this appointment"
              />
            }
          }

          @if (tab() === 'past') {
            @if (!booking().hasReview && booking().status === 'COMPLETED') {
              <p-button
                icon="pi pi-pencil"
                [label]="'appointments.leaveReview' | translate"
                size="small"
                [rounded]="true"
                (onClick)="reviewRequested.emit()"
                aria-label="Leave a review for this booking"
              />
            }
            <p-button
              icon="pi pi-replay"
              [label]="'appointments.bookAgain' | translate"
              [outlined]="true"
              size="small"
              [rounded]="true"
              (onClick)="bookAgain()"
              aria-label="Book this salon again"
            />
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
      color: #000000;
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
      color: #000000;
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
      font-size: 16px;
      &.star--full, &.star--half { color: #f59e0b; }
      &.star--empty { color: #d1d5db; }
    }

    .appt-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }

    .inline-icon {
      font-size: 15px;
      vertical-align: middle; margin-right: 3px; opacity: .65;
    }
    .inline-icon-sm {
      font-size: 13px;
      vertical-align: middle; margin-right: 2px;
    }

    :host-context(.app-dark) {
      .appt-card {
        background: #18181b;
        border-color: #3f3f46;
      }
      .appt-thumb { background: #27272a; }
      .appt-name { color: #f4f4f5; }
      .appt-service, .appt-stylist { color: #a1a1aa; }
      .appt-datetime { color: #d4d4d8; }
      .appt-meta, .appt-review-label { color: #71717a; }
      .appt-price { color: #f4f4f5; }
      .star--empty { color: #52525b; }
      .badge--pending     { background: rgba(254,249,195,.12); color: #fde047; }
      .badge--confirmed   { background: rgba(220,252,231,.12); color: #4ade80; }
      .badge--in-progress { background: rgba(219,234,254,.12); color: #60a5fa; }
      .badge--completed   { background: rgba(224,231,255,.12); color: #818cf8; }
      .badge--cancelled   { background: rgba(254,226,226,.12); color: #f87171; }
    }
  `],
})
export class AppointmentCardComponent {
  readonly booking = input.required<Booking & { hasReview?: boolean; clientRating?: number }>();
  readonly tab = input.required<AppointmentTab>();

  /** Emitted when the user requests cancellation (parent opens dialog). */
  readonly cancelRequested = output<void>();

  /** Emitted when the user clicks "Leave a Review" (parent opens dialog). */
  readonly reviewRequested = output<void>();

  /** Emitted when the user requests to modify services on this booking. */
  readonly modifyRequested = output<void>();

  private readonly router = inject(Router);

  // ── Derived ────────────────────────────────────────────────────────────────
  statusCss(): string {
    return STATUS_CONFIG[this.booking().status]?.css ?? '';
  }

  stars() {
    return buildStars(this.booking().clientRating ?? 0);
  }

  canModify(): boolean {
    return MODIFIABLE_STATUSES.includes(this.booking().status);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  getDirections(): void {
    // The Booking model has salonId but not salonAddress — use salonName for a name search.
    const query = encodeURIComponent(this.booking().salonName);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  }

  bookAgain(): void {
    void this.router.navigate(['/booking', this.booking().salonId]);
  }

  addToCalendar(): void {
    const b = this.booking();
    const dateStr = b.appointmentDate.replace(/-/g, ''); // YYYYMMDD
    const startStr = b.startTime.replace(':', '') + '00';  // HHMMSS
    const endStr   = b.endTime.replace(':', '')   + '00';  // HHMMSS

    const params = new URLSearchParams({
      action:   'TEMPLATE',
      text:     `${b.serviceName} at ${b.salonName}`,
      dates:    `${dateStr}T${startStr}/${dateStr}T${endStr}`,
      details:  [
        `Service: ${b.serviceName}`,
        b.stylistName ? `Stylist: ${b.stylistName}` : '',
        `Booking ID: ${b._id}`,
      ].filter(Boolean).join('\n'),
      location: b.salonName,
    });

    window.open(
      `https://calendar.google.com/calendar/render?${params.toString()}`,
      '_blank',
      'noopener,noreferrer',
    );
  }
}

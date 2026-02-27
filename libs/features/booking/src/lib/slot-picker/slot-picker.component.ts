import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, Subject, switchMap, tap } from 'rxjs';
import { DatePipe } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { provideNativeDateAdapter } from '@angular/material/core';

import { BookingSlot } from '@org/models';
import { BookingService } from '../services/booking.service';

interface SlotSelection {
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  slot: string;
}

@Component({
  selector: 'lib-slot-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideNativeDateAdapter()],
  imports: [
    DatePipe,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="step-header">
      <h2 class="step-title">Pick a Date & Time</h2>
      <p class="step-subtitle">
        Choose when you'd like your
        <strong>{{ serviceLabel() }}</strong> appointment ({{ duration() }} min)
      </p>
    </div>

    <!-- Date picker -->
    <div class="date-section">
      <mat-form-field appearance="outline" class="date-field">
        <mat-label>Appointment date</mat-label>
        <input
          matInput
          [matDatepicker]="dp"
          [min]="minDate"
          [value]="selectedDate()"
          (dateChange)="onDateChange($event.value)"
          readonly
          aria-label="Select appointment date"
        />
        <mat-datepicker-toggle matIconSuffix [for]="dp" />
        <mat-datepicker #dp />
      </mat-form-field>

      @if (selectedDate()) {
        <div class="selected-date-label">
          <mat-icon>event</mat-icon>
          {{ selectedDate()! | date: 'EEEE, MMMM d, y' }}
        </div>
      }
    </div>

    <!-- Time slots -->
    @if (selectedDate()) {
      <div class="slots-section">
        <h3 class="slots-heading">Available times</h3>

        @if (isLoading()) {
          <div class="slots-loading">
            <mat-spinner diameter="36" />
            <span>Checking availability…</span>
          </div>
        } @else if (slotsError()) {
          <div class="slots-error">
            <mat-icon color="warn">error_outline</mat-icon>
            <span>{{ slotsError() }}</span>
            <button mat-stroked-button (click)="retry()">
              <mat-icon>refresh</mat-icon> Retry
            </button>
          </div>
        } @else if (slots().length === 0) {
          <p class="slots-empty">No slots available for this date. Please try another day.</p>
        } @else {
          <div class="slots-grid" role="listbox" aria-label="Available time slots">
            @for (slot of slots(); track slot.time) {
              <button
                class="slot-btn"
                [class.slot-btn--available]="slot.available"
                [class.slot-btn--unavailable]="!slot.available"
                [class.slot-btn--selected]="selectedSlot() === slot.time"
                [disabled]="!slot.available"
                role="option"
                [attr.aria-selected]="selectedSlot() === slot.time"
                [attr.aria-disabled]="!slot.available"
                [attr.aria-label]="slot.time + (slot.available ? '' : ' — unavailable')"
                (click)="selectSlot(slot)"
              >
                {{ slot.time }}
              </button>
            }
          </div>

          <p class="slots-legend">
            <span class="legend-dot legend-dot--available"></span> Available
            <span class="legend-dot legend-dot--unavailable" style="margin-left:16px"></span> Booked
          </p>
        }
      </div>
    }

    <!-- Navigation -->
    <div class="step-actions">
      <button mat-stroked-button (click)="back.emit()">
        <mat-icon>arrow_back</mat-icon> Back
      </button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="!canContinue()"
        (click)="confirm()"
      >
        Continue
        <mat-icon iconPositionEnd>arrow_forward</mat-icon>
      </button>
    </div>
  `,
  styles: [`
    .step-header { margin-bottom: 24px; }
    .step-title { font-size: 1.35rem; font-weight: 700; margin: 0 0 6px; color: #1a1a2e; }
    .step-subtitle { font-size: 0.9rem; color: #6b7280; margin: 0; }

    /* ── Date section ── */
    .date-section { margin-bottom: 28px; }
    .date-field { width: 260px; max-width: 100%; }

    .selected-date-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.9rem;
      color: #374151;
      margin-top: 4px;
      font-weight: 500;
    }

    .selected-date-label mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      color: var(--mat-sys-primary, #6750A4);
    }

    /* ── Slots section ── */
    .slots-section { margin-bottom: 28px; }
    .slots-heading { font-size: 0.95rem; font-weight: 600; margin: 0 0 14px; color: #374151; }

    .slots-loading {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #6b7280;
      font-size: 0.9rem;
      padding: 16px 0;
    }

    .slots-error {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #ef4444;
      font-size: 0.9rem;
      flex-wrap: wrap;
      padding: 12px 0;
    }

    .slots-empty { color: #9ca3af; font-size: 0.9rem; padding: 16px 0; }

    /* ── Slot buttons ── */
    .slots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .slot-btn {
      padding: 8px 4px;
      border-radius: 8px;
      border: 2px solid transparent;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      text-align: center;
    }

    .slot-btn--available {
      background: #f0fdf4;
      border-color: #86efac;
      color: #166534;
    }

    .slot-btn--available:hover:not(:disabled) {
      background: #dcfce7;
      border-color: #4ade80;
    }

    .slot-btn--unavailable {
      background: #f9fafb;
      border-color: #e5e7eb;
      color: #d1d5db;
      cursor: not-allowed;
    }

    .slot-btn--selected {
      background: var(--mat-sys-primary, #6750A4) !important;
      border-color: var(--mat-sys-primary, #6750A4) !important;
      color: #fff !important;
      box-shadow: 0 2px 8px rgba(103, 80, 164, 0.35);
    }

    .slots-legend {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      color: #9ca3af;
      margin: 0;
    }

    .legend-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .legend-dot--available { background: #86efac; }
    .legend-dot--unavailable { background: #e5e7eb; }

    /* ── Actions ── */
    .step-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 8px;
    }

    @media (max-width: 480px) {
      .slots-grid { grid-template-columns: repeat(4, 1fr); }
    }
  `],
})
export class SlotPickerComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────────
  readonly salonId    = input.required<string>();
  readonly duration   = input.required<number>();
  readonly serviceLabel = input<string>('service');

  // ── Outputs ───────────────────────────────────────────────────────────────────
  readonly slotSelected = output<SlotSelection>();
  readonly back         = output<void>();

  // ── Services ──────────────────────────────────────────────────────────────────
  private readonly bookingService = inject(BookingService);

  // ── State ─────────────────────────────────────────────────────────────────────
  readonly selectedDate  = signal<Date | null>(null);
  readonly selectedSlot  = signal<string | null>(null);
  readonly slots         = signal<BookingSlot[]>([]);
  readonly isLoading     = signal(false);
  readonly slotsError    = signal<string | null>(null);

  readonly canContinue = computed(() => !!this.selectedDate() && !!this.selectedSlot());

  /** Minimum selectable date = today */
  readonly minDate = new Date();

  // ── RxJS pipeline ─────────────────────────────────────────────────────────────
  private readonly dateTrigger$ = new Subject<string>();
  private lastDateStr = '';

  constructor() {
    this.dateTrigger$
      .pipe(
        tap(() => {
          this.isLoading.set(true);
          this.slotsError.set(null);
          this.slots.set([]);
          this.selectedSlot.set(null);
        }),
        switchMap((dateStr) =>
          this.bookingService.getAvailableSlots(this.salonId(), dateStr, this.duration()).pipe(
            catchError((): ReturnType<BookingService['getAvailableSlots']> => {
              this.slotsError.set('Could not load slots. Please try again.');
              return of({ date: dateStr, slots: [] });
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((resp) => {
        this.slots.set(resp.slots);
        this.isLoading.set(false);
      });
  }

  onDateChange(date: Date | null): void {
    if (!date) return;
    this.selectedDate.set(date);
    const dateStr = formatDate(date);
    this.lastDateStr = dateStr;
    this.dateTrigger$.next(dateStr);
  }

  selectSlot(slot: BookingSlot): void {
    if (!slot.available) return;
    this.selectedSlot.set(slot.time);
  }

  retry(): void {
    if (this.lastDateStr) this.dateTrigger$.next(this.lastDateStr);
  }

  confirm(): void {
    const date = this.selectedDate();
    const slot = this.selectedSlot();
    if (!date || !slot) return;
    this.slotSelected.emit({ date: formatDate(date), slot });
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

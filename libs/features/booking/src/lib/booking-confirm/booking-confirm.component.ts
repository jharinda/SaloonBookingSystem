import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BookingDraft } from '@org/models';

@Component({
  selector: 'lib-booking-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="step-header">
      <h2 class="step-title">Review Your Booking</h2>
      <p class="step-subtitle">Confirm the details below before booking</p>
    </div>

    <!-- Summary card -->
    <div class="summary-card">

      <!-- Salon -->
      <div class="summary-row">
        <mat-icon class="summary-icon">storefront</mat-icon>
        <div class="summary-body">
          <div class="summary-label">Salon</div>
          <div class="summary-value">{{ draft().salon.name }}</div>
          <div class="summary-sub">{{ draft().salon.address.city }}</div>
        </div>
      </div>

      <mat-divider />

      <!-- Service -->
      <div class="summary-row">
        <mat-icon class="summary-icon">content_cut</mat-icon>
        <div class="summary-body">
          <div class="summary-label">Service</div>
          <div class="summary-value">{{ draft().service.name }}</div>
          <div class="summary-sub">{{ draft().service.category }} · {{ draft().service.duration }} min</div>
        </div>
      </div>

      <mat-divider />

      <!-- Date & Time -->
      <div class="summary-row">
        <mat-icon class="summary-icon">event</mat-icon>
        <div class="summary-body">
          <div class="summary-label">Date & Time</div>
          <div class="summary-value">
            {{ draft().date | date: 'EEEE, MMMM d, y' }}
          </div>
          <div class="summary-sub">Starting at <strong>{{ draft().slot }}</strong></div>
        </div>
      </div>

      <mat-divider />

      <!-- Price -->
      <div class="summary-row">
        <mat-icon class="summary-icon">payments</mat-icon>
        <div class="summary-body">
          <div class="summary-label">Total</div>
          <div class="summary-value summary-value--price">
            LKR {{ draft().service.price | number }}
          </div>
          <div class="summary-sub">Pay at salon</div>
        </div>
      </div>
    </div>

    <!-- Notes field -->
    <mat-form-field appearance="outline" class="notes-field">
      <mat-label>Notes (optional)</mat-label>
      <textarea
        matInput
        rows="3"
        maxlength="300"
        placeholder="Any special requests or information for the stylist…"
        [ngModel]="notes()"
        (ngModelChange)="notes.set($event)"
      ></textarea>
      <mat-hint align="end">{{ notes().length }}/300</mat-hint>
    </mat-form-field>

    <!-- Actions -->
    <div class="step-actions">
      <button mat-stroked-button [disabled]="isSubmitting()" (click)="back.emit()">
        <mat-icon>arrow_back</mat-icon> Back
      </button>

      <button
        mat-raised-button
        color="primary"
        [disabled]="isSubmitting()"
        (click)="onConfirm()"
        aria-label="Confirm and create booking"
      >
        @if (isSubmitting()) {
          <mat-spinner diameter="20" class="btn-spinner" />
        } @else {
          <mat-icon>check_circle</mat-icon>
        }
        {{ isSubmitting() ? 'Confirming…' : 'Confirm Booking' }}
      </button>
    </div>
  `,
  styles: [`
    .step-header { margin-bottom: 24px; }
    .step-title { font-size: 1.35rem; font-weight: 700; margin: 0 0 6px; color: #1a1a2e; }
    .step-subtitle { font-size: 0.9rem; color: #6b7280; margin: 0; }

    /* ── Summary card ── */
    .summary-card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 24px;
      background: #fff;
    }

    .summary-row {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 18px;
    }

    .summary-icon {
      color: var(--mat-sys-primary, #6750A4);
      font-size: 1.35rem;
      width: 1.35rem;
      height: 1.35rem;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .summary-body { flex: 1; min-width: 0; }

    .summary-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9ca3af;
      font-weight: 500;
      margin-bottom: 2px;
    }

    .summary-value {
      font-weight: 600;
      font-size: 0.97rem;
      color: #111827;
    }

    .summary-value--price {
      font-size: 1.15rem;
      color: var(--mat-sys-primary, #6750A4);
    }

    .summary-sub {
      font-size: 0.82rem;
      color: #6b7280;
      margin-top: 2px;
    }

    /* ── Notes ── */
    .notes-field {
      width: 100%;
      margin-bottom: 20px;
    }

    /* ── Actions ── */
    .step-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-top: 4px;
    }

    .btn-spinner {
      display: inline-block;
      vertical-align: middle;
      margin-right: 6px;
    }
  `],
})
export class BookingConfirmComponent {
  readonly draft        = input.required<BookingDraft>();
  readonly isSubmitting = input<boolean>(false);

  readonly confirm = output<string>();  // emits notes text
  readonly back    = output<void>();

  readonly notes = signal('');

  onConfirm(): void {
    this.confirm.emit(this.notes());
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  output,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';

import { BookingStateService } from '../services/booking-state.service';
import { BookingService, CreateBookingDto } from '@org/shared-data-access';

/**
 * Step 4: Booking Confirmation
 * - Summary card with all booking details
 * - Notes textarea for special requests
 * - Confirm booking button that calls API
 * - Loading and error states
 * - Material Design UI
 */
@Component({
  selector: 'lib-booking-confirmation-step',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    DatePipe,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './booking-confirmation-step.component.html',
  styleUrl: './booking-confirmation-step.component.scss',
})
export class BookingConfirmationStepComponent {
  private readonly bookingState = inject(BookingStateService);
  private readonly bookingService = inject(BookingService);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly salon = this.bookingState.salon;
  readonly selectedServices = this.bookingState.selectedServices;
  readonly selectedStylistId = this.bookingState.selectedStylistId;
  readonly selectedDate = this.bookingState.selectedDate;
  readonly selectedTime = this.bookingState.selectedTime;
  readonly totalPrice = this.bookingState.totalPrice;
  readonly totalDuration = this.bookingState.totalDuration;
  readonly notes = this.bookingState.notes;

  readonly submitting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);

  // ── Events ───────────────────────────────────────────────────────────────────
  readonly bookingCreated = output<string>(); // Emits booking ID on success

  // ── Methods ──────────────────────────────────────────────────────────────────
  updateNotes(value: string): void {
    this.bookingState.updateNotes(value);
  }

  confirmBooking(): void {
    const state = this.bookingState.currentState;
    const salon = state.salon;
    const services = state.selectedServices;
    const date = state.selectedDate;
    const time = state.selectedTime;

    if (!salon || services.length === 0 || !date || !time) {
      this.submitError.set('Missing required booking information');
      return;
    }

    // Build CreateBookingDto
    const dto: CreateBookingDto = {
      salonId: salon._id,
      salonName: salon.name,
      stylistId: state.selectedStylistId || undefined,
      services: services.map((svc) => ({
        serviceId: svc._id,
        name: svc.name,
        price: svc.price,
        durationMinutes: svc.duration,
      })),
      appointmentDate: date.toISOString().split('T')[0], // YYYY-MM-DD
      startTime: time, // "HH:mm"
      notes: state.notes || undefined,
    };

    this.submitting.set(true);
    this.submitError.set(null);

    this.bookingService.createBooking(dto).subscribe({
      next: (booking) => {
        this.submitting.set(false);
        this.bookingCreated.emit(booking._id);
      },
      error: (err) => {
        console.error('Failed to create booking:', err);
        this.submitting.set(false);
        this.submitError.set(
          err.error?.message || 'Failed to create booking. Please try again.'
        );
      },
    });
  }

  getStylistLabel(): string {
    return this.selectedStylistId() ? 'Preferred Stylist' : 'Any Available Stylist';
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  output,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CardModule } from 'primeng/card';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { FormsModule } from '@angular/forms';

import { BookingStateService } from '../services/booking-state.service';
import { BookingService, CreateBookingDto, AppCurrencyPipe } from '@org/shared-data-access';
import { SalonServiceItem } from '@org/models';

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
    DatePipe,
    FormsModule,
    CardModule,
    FloatLabelModule,
    InputTextModule,
    ButtonModule,
    ProgressSpinnerModule,
    AppCurrencyPipe,
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
    const salon = this.bookingState.salon();
    const services = this.bookingState.selectedServices();
    const date = this.bookingState.selectedDate();
    const time = this.bookingState.selectedTime();

    if (!salon || services.length === 0 || !date || !time) {
      this.submitError.set('Missing required booking information');
      return;
    }

    // Build CreateBookingDto
    const dto: CreateBookingDto = {
      salonId: salon._id,
      salonName: salon.name,
      stylistId: this.bookingState.selectedStylistId() || undefined,
      services: services.map((svc: SalonServiceItem) => ({
        serviceId: svc._id,
        name: svc.name,
        price: svc.price,
        durationMinutes: svc.duration,
      })),
      appointmentDate: this._fmtLocalDate(date), // YYYY-MM-DD (local, avoids UTC shift)
      startTime: time, // "HH:mm"
      notes: this.bookingState.notes() || undefined,
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

  /** Format a Date as YYYY-MM-DD using LOCAL components (avoids UTC-midnight shift). */
  private _fmtLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

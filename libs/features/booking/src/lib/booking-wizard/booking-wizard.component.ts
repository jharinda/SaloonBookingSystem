import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  ViewChild,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SalonService } from '@org/shared-data-access';
import { BookingStateService } from '../services/booking-state.service';
import { ServiceSelectionStepComponent } from '../steps/service-selection-step.component';
import { StylistSelectionStepComponent } from '../steps/stylist-selection-step.component';
import { DateTimeSelectionStepComponent } from '../steps/datetime-selection-step.component';
import { BookingConfirmationStepComponent } from '../steps/booking-confirmation-step.component';

/**
 * Booking Wizard Component
 * - 4-step booking flow using Angular CDK Stepper
 * - Step 1: Service selection with multi-select
 * - Step 2: Stylist selection (any available or specific)
 * - Step 3: Date & time picker with API slot fetching
 * - Step 4: Confirmation with summary and notes
 * - Material Design UI
 */

@Component({
  selector: 'lib-booking-wizard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ServiceSelectionStepComponent,
    StylistSelectionStepComponent,
    DateTimeSelectionStepComponent,
    BookingConfirmationStepComponent,
  ],
  providers: [BookingStateService], // Provide at component level for wizard state isolation
  templateUrl: './booking-wizard.component.html',
  styleUrl: './booking-wizard.component.scss',
})
export class BookingWizardComponent implements OnInit {
  @ViewChild('stepper') stepper!: MatStepper;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly salonService = inject(SalonService);
  readonly bookingState = inject(BookingStateService);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // ── Computed ─────────────────────────────────────────────────────────────────
  readonly salon = this.bookingState.salon;
  readonly isStep1Valid = this.bookingState.isStep1Valid;
  readonly isStep3Valid = this.bookingState.isStep3Valid;

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const salonId = this.route.snapshot.paramMap.get('salonId');
    if (!salonId) {
      this.error.set('Salon ID not found');
      this.loading.set(false);
      return;
    }

    this.loadSalon(salonId);
  }

  // ── Data Loading ─────────────────────────────────────────────────────────────
  private loadSalon(salonId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.salonService.getSalonById(salonId).subscribe({
      next: (salon) => {
        this.bookingState.initState(salonId, salon);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load salon:', err);
        this.error.set('Failed to load salon details. Please try again.');
        this.loading.set(false);
      },
    });
  }

  // ── Stepper Navigation ───────────────────────────────────────────────────────
  goToNextStep(): void {
    if (this.stepper) {
      this.stepper.next();
      this.bookingState.nextStep();
    }
  }

  goToPreviousStep(): void {
    if (this.stepper) {
      this.stepper.previous();
      this.bookingState.previousStep();
    }
  }

  // ── Booking Success ──────────────────────────────────────────────────────────
  onBookingCreated(bookingId: string): void {
    this.router.navigate(['/booking/success', bookingId]);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  goToDiscover(): void {
    this.router.navigate(['/discover']);
  }
}


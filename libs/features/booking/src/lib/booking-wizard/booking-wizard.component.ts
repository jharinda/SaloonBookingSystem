import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Stepper, StepperModule } from 'primeng/stepper';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

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
    CommonModule,
    StepperModule,
    ButtonModule,
    ProgressSpinnerModule,
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
  @ViewChild('stepper') stepper!: Stepper;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly salonService = inject(SalonService);
  readonly bookingState = inject(BookingStateService);

  // ── State ────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currentStep = computed(() => this.bookingState.currentStep());

  readonly steps = [
    { label: 'Services', icon: 'content_cut' },
    { label: 'Stylist', icon: 'person' },
    { label: 'Date & Time', icon: 'schedule' },
    { label: 'Confirm', icon: 'check_circle' },
  ];

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
    this.bookingState.nextStep();
  }

  goToPreviousStep(): void {
    this.bookingState.previousStep();
  }

  onActiveStepChange(step: number | undefined): void {
    if (step !== undefined) {
      this.bookingState.setStep(step);
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


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
import { Stepper, StepList, Step, StepPanels, StepPanel } from 'primeng/stepper';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, of, switchMap } from 'rxjs';

import { SalonService } from '@org/shared-data-access';
import { BookingStateService } from '../services/booking-state.service';
import { ServiceSelectionStepComponent } from '../steps/service-selection-step.component';
import { StylistSelectionStepComponent } from '../steps/stylist-selection-step.component';
import { DateTimeSelectionStepComponent } from '../steps/datetime-selection-step.component';
import { BookingConfirmationStepComponent } from '../steps/booking-confirmation-step.component';
import { BookingService } from '@org/shared-data-access';

/**
 * Booking Wizard Component
 * - 4-step booking flow using Angular CDK Stepper
 * - Step 1: Service selection with multi-select
 * - Step 2: Date & time picker with API slot fetching
 * - Step 3: Stylist selection (any available or specific)
 * - Step 4: Confirmation with summary and notes
 * - Material Design UI
 */

@Component({
  selector: 'lib-booking-wizard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    Stepper,
    StepList,
    Step,
    StepPanels,
    StepPanel,
    Button,
    ProgressSpinner,
    ServiceSelectionStepComponent,
    StylistSelectionStepComponent,
    DateTimeSelectionStepComponent,
    BookingConfirmationStepComponent,
    TranslateModule,
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
  private readonly bookingService = inject(BookingService);
  readonly bookingState = inject(BookingStateService);

  // ── State ────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currentStep = computed(() => this.bookingState.currentStep());

  readonly steps = [
    { label: 'Services', icon: 'content_cut' },
    { label: 'Date & Time', icon: 'schedule' },
    { label: 'Stylist', icon: 'person' },
    { label: 'Confirm', icon: 'check_circle' },
  ];

  // ── Computed ─────────────────────────────────────────────────────────────────
  readonly salon = this.bookingState.salon;
  readonly isStep1Valid = this.bookingState.isStep1Valid;
  readonly isStep2Valid = this.bookingState.isStep2Valid;
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

    this.salonService.getSalonById(salonId).pipe(
      catchError((salonErr) => {
        // If salon not found, check if this might be a booking ID
        console.log('Salon not found, checking if this is a booking ID...');
        return this.bookingService.getById(salonId).pipe(
          switchMap(() => {
            // Found a booking! Redirect to booking view page
            console.log('Booking found, redirecting to booking view...');
            this.router.navigate(['/booking/view', salonId]);
            return of(null);
          }),
          catchError(() => {
            // Not a booking either, show salon error
            throw salonErr;
          })
        );
      })
    ).subscribe({
      next: (salon) => {
        if (salon) {
          this.bookingState.initState(salonId, salon);

          // Pre-select services from query params (for "Book Again" flow)
          const serviceIdsParam = this.route.snapshot.queryParamMap.get('serviceIds');
          if (serviceIdsParam) {
            const ids = serviceIdsParam.split(',').filter(Boolean);
            this.bookingState.preselectServicesByIds(ids);
          }

          this.loading.set(false);
        }
        // If null, we're redirecting to booking view
      },
      error: (err) => {
        console.error('Failed to load salon:', err);
        this.error.set('Salon not found. Please check the link and try again.');
        this.loading.set(false);
      },
    });
  }

  // ── Stepper Navigation ───────────────────────────────────────────────────────
  goToNextStep(): void {
    const nextStep = this.currentStep() + 1;
    if (nextStep <= 4) {
      this.bookingState.setStep(nextStep);
    }
  }

  goToPreviousStep(): void {
    const prevStep = this.currentStep() - 1;
    if (prevStep >= 1) {
      this.bookingState.setStep(prevStep);
    }
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


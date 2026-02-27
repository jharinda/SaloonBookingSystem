import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, of, switchMap } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';

import { Booking, BookingDraft, Salon, SalonServiceItem } from '@org/models';
import { SalonService } from '@org/discover';
import { BookingService } from '../services/booking.service';
import { ServiceSelectorComponent } from '../service-selector/service-selector.component';
import { SlotPickerComponent } from '../slot-picker/slot-picker.component';
import { BookingConfirmComponent } from '../booking-confirm/booking-confirm.component';

@Component({
  selector: 'lib-booking-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatStepperModule,
    ServiceSelectorComponent,
    SlotPickerComponent,
    BookingConfirmComponent,
  ],
  template: `
    <div class="wizard-container">

      <!-- ── Loading salon ─────────────────────────────────────── -->
      @if (isSalonLoading()) {
        <div class="wizard-state">
          <mat-spinner diameter="48" />
          <p>Loading salon details…</p>
        </div>
      }

      <!-- ── Failed to load salon ──────────────────────────────── -->
      @if (!isSalonLoading() && salonError()) {
        <div class="wizard-state wizard-state--error">
          <mat-icon color="warn">error_outline</mat-icon>
          <p>{{ salonError() }}</p>
          <button mat-raised-button color="primary" (click)="goToDiscover()">
            <mat-icon>search</mat-icon> Back to Discover
          </button>
        </div>
      }

      <!-- ── Wizard ────────────────────────────────────────────── -->
      @if (!isSalonLoading() && salon()) {
        <!-- Salon identity bar -->
        <div class="wizard-salon-bar">
          <img
            class="salon-bar-img"
            [src]="salon()!.images?.[0] ?? 'assets/images/salon-placeholder.jpg'"
            [alt]="salon()!.name"
            (error)="onImgError($event)"
          />
          <div class="salon-bar-info">
            <div class="salon-bar-name">{{ salon()!.name }}</div>
            <div class="salon-bar-city">
              <mat-icon class="inline-icon">location_on</mat-icon>
              {{ salon()!.address.city }}
            </div>
          </div>
        </div>

        <!-- Stepper -->
        <mat-stepper
          #stepper
          [linear]="true"
          animationDuration="300ms"
          class="wizard-stepper"
        >
          <!-- ════════════ STEP 1 — Service ════════════ -->
          <mat-step [completed]="!!selectedService()">
            <ng-template matStepLabel>Service</ng-template>

            <lib-service-selector
              [salon]="salon()!"
              (serviceSelected)="onServiceSelected($event)"
            />
          </mat-step>

          <!-- ════════════ STEP 2 — Date & Time ════════════ -->
          <mat-step [completed]="!!selectedDate() && !!selectedSlot()">
            <ng-template matStepLabel>Date &amp; Time</ng-template>

            @if (selectedService()) {
              <lib-slot-picker
                [salonId]="salon()!._id"
                [duration]="selectedService()!.duration"
                [serviceLabel]="selectedService()!.name"
                (slotSelected)="onSlotSelected($event)"
                (back)="onBack()"
              />
            }
          </mat-step>

          <!-- ════════════ STEP 3 — Confirm ════════════ -->
          <mat-step>
            <ng-template matStepLabel>Confirm</ng-template>

            @if (draft()) {
              <lib-booking-confirm
                [draft]="draft()!"
                [isSubmitting]="isSubmitting()"
                (confirm)="onConfirm($event)"
                (back)="onBack()"
              />
            }
          </mat-step>
        </mat-stepper>
      }

    </div>
  `,
  styles: [`
    .wizard-container {
      max-width: 700px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    /* ── State panels ── */
    .wizard-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 80px 24px;
      text-align: center;
      color: #6b7280;
      font-size: 0.95rem;
    }

    .wizard-state--error { color: #ef4444; }

    /* ── Salon bar ── */
    .wizard-salon-bar {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 18px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      margin-bottom: 28px;
    }

    .salon-bar-img {
      width: 54px;
      height: 54px;
      border-radius: 8px;
      object-fit: cover;
      flex-shrink: 0;
      background: #f0f0f0;
    }

    .salon-bar-info { min-width: 0; }

    .salon-bar-name {
      font-weight: 700;
      font-size: 1rem;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .salon-bar-city {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 0.82rem;
      color: #6b7280;
      margin-top: 2px;
    }

    .inline-icon {
      font-size: 0.9rem;
      width: 0.9rem;
      height: 0.9rem;
      color: var(--mat-sys-primary, #6750A4);
    }

    /* ── Stepper ── */
    .wizard-stepper {
      background: transparent;
    }

    /* Override default mat-step body padding  */
    ::ng-deep .wizard-stepper .mat-step-body-active {
      padding: 20px 0 0;
    }

    @media (max-width: 480px) {
      .wizard-container { padding: 16px; }
    }
  `],
})
export class BookingWizardComponent {
  // ── Services ────────────────────────────────────────────────────────────────
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly salonService   = inject(SalonService);
  private readonly bookingService = inject(BookingService);
  private readonly snackBar       = inject(MatSnackBar);

  // ── ViewChild (signal-based) ─────────────────────────────────────────────────
  readonly stepper = viewChild.required<MatStepper>('stepper');

  // ── Route param → salon load ──────────────────────────────────────────────────
  private readonly salonId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('salonId') ?? '')),
    { initialValue: '' },
  );

  readonly salon          = signal<Salon | null>(null);
  readonly isSalonLoading = signal(true);
  readonly salonError    = signal<string | null>(null);

  // ── Wizard draft state ────────────────────────────────────────────────────────
  readonly selectedService = signal<SalonServiceItem | null>(null);
  readonly selectedDate    = signal<string | null>(null);  // "YYYY-MM-DD"
  readonly selectedSlot    = signal<string | null>(null);  // "HH:mm"
  readonly isSubmitting    = signal(false);

  readonly draft = computed<BookingDraft | null>(() => {
    const salon   = this.salon();
    const service = this.selectedService();
    const dateStr = this.selectedDate();
    const slot    = this.selectedSlot();
    if (!salon || !service || !dateStr || !slot) return null;
    return { salon, service, date: new Date(dateStr + 'T00:00:00'), slot, notes: '' };
  });

  constructor() {
    toObservable(this.salonId)
      .pipe(
        filter((id) => !!id),
        switchMap((id) =>
          this.salonService.getById(id).pipe(
            catchError(() => {
              this.salonError.set('Could not load salon details. Please go back and try again.');
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((salon) => {
        this.salon.set(salon);
        this.isSalonLoading.set(false);
      });
  }

  // ── Step handlers ─────────────────────────────────────────────────────────────

  onServiceSelected(service: SalonServiceItem): void {
    this.selectedService.set(service);
    this.stepper().next();
  }

  onSlotSelected(selection: { date: string; slot: string }): void {
    this.selectedDate.set(selection.date);
    this.selectedSlot.set(selection.slot);
    this.stepper().next();
  }

  onBack(): void {
    this.stepper().previous();
  }

  onConfirm(notes: string): void {
    const salon   = this.salon();
    const service = this.selectedService();
    const date    = this.selectedDate();
    const slot    = this.selectedSlot();
    if (!salon || !service || !date || !slot) return;

    this.isSubmitting.set(true);

    this.bookingService
      .createBooking({
        salonId:         salon._id,
        serviceId:       service._id,
        appointmentDate: date,
        startTime:       slot,
        notes:           notes || undefined,
      })
      .subscribe({
        next: (booking: Booking) => {
          void this.router.navigate(['/booking', 'success', booking._id]);
        },
        error: () => {
          this.isSubmitting.set(false);
          this.snackBar.open(
            'Could not create booking. Please try again.',
            'Dismiss',
            { duration: 4000 },
          );
        },
      });
  }

  goToDiscover(): void {
    void this.router.navigate(['/discover']);
  }

  onImgError(event: Event): void {
    (event.target as HTMLImageElement).src = 'assets/images/salon-placeholder.jpg';
  }
}

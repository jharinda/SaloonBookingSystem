import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepperModule } from '@angular/material/stepper';

import { SalonAdminService } from '@org/shared-data-access';

// ── Validators ────────────────────────────────────────────────────────────────

function latValidator(c: AbstractControl): ValidationErrors | null {
  const v = Number(c.value);
  return isNaN(v) || v < -90 || v > 90 ? { invalidLat: true } : null;
}

function lngValidator(c: AbstractControl): ValidationErrors | null {
  const v = Number(c.value);
  return isNaN(v) || v < -180 || v > 180 ? { invalidLng: true } : null;
}

@Component({
  selector: 'lib-register-salon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatStepperModule,
  ],
  template: `
    <div class="register-page">
      <div class="register-card">

        <!-- Header -->
        <div class="register-header">
          <mat-icon class="header-icon">store</mat-icon>
          <div>
            <h1 class="register-title">Register Your Salon</h1>
            <p class="register-subtitle">
              Fill in your salon details. Your listing will go live after admin approval.
            </p>
          </div>
        </div>

        <!-- Success state -->
        @if (submitted()) {
          <div class="success-state">
            <mat-icon class="success-icon">check_circle</mat-icon>
            <h2>Salon submitted!</h2>
            <p>
              Your salon <strong>{{ submittedName() }}</strong> has been submitted for review.
              An admin will approve it shortly — you'll be able to manage it from your dashboard once approved.
            </p>
            <button mat-flat-button color="primary" (click)="goToDashboard()">
              Go to Dashboard
            </button>
          </div>
        } @else {
          <!-- Error banner -->
          @if (errorMessage()) {
            <div class="error-banner" role="alert">
              <mat-icon>error_outline</mat-icon>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <!-- Stepper form -->
          <mat-stepper [linear]="true" #stepper orientation="horizontal">

            <!-- Step 1: Salon Info -->
            <mat-step [stepControl]="infoGroup" label="Salon Info">
              <form [formGroup]="infoGroup" novalidate class="step-form">

                <mat-form-field appearance="outline" class="full">
                  <mat-label>Salon name</mat-label>
                  <input matInput formControlName="name" maxlength="100" />
                  @if (infoGroup.controls.name.invalid && infoGroup.controls.name.touched) {
                    <mat-error>Salon name is required (max 100 chars).</mat-error>
                  }
                </mat-form-field>

                <mat-form-field appearance="outline" class="full">
                  <mat-label>Description (optional)</mat-label>
                  <textarea matInput formControlName="description" rows="3"
                    placeholder="Tell clients what makes your salon special…"></textarea>
                </mat-form-field>

                <div class="two-col">
                  <mat-form-field appearance="outline">
                    <mat-label>Phone number</mat-label>
                    <mat-icon matPrefix>phone</mat-icon>
                    <input matInput formControlName="phone" type="tel"
                      placeholder="+94771234567" />
                    @if (infoGroup.controls.phone.invalid && infoGroup.controls.phone.touched) {
                      <mat-error>Phone number is required.</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Business email</mat-label>
                    <mat-icon matPrefix>email</mat-icon>
                    <input matInput formControlName="email" type="email"
                      placeholder="salon@example.com" />
                    @if (infoGroup.controls.email.invalid && infoGroup.controls.email.touched) {
                      <mat-error>A valid email address is required.</mat-error>
                    }
                  </mat-form-field>
                </div>

                <div class="step-actions">
                  <button mat-flat-button color="primary" matStepperNext
                    type="button" (click)="touchInfo()">
                    Next
                  </button>
                </div>
              </form>
            </mat-step>

            <!-- Step 2: Location -->
            <mat-step [stepControl]="addressGroup" label="Location">
              <form [formGroup]="addressGroup" novalidate class="step-form">

                <mat-form-field appearance="outline" class="full">
                  <mat-label>Street address</mat-label>
                  <mat-icon matPrefix>location_on</mat-icon>
                  <input matInput formControlName="street"
                    placeholder="123 Main Street" />
                  @if (addressGroup.controls.street.invalid && addressGroup.controls.street.touched) {
                    <mat-error>Street address is required.</mat-error>
                  }
                </mat-form-field>

                <div class="two-col">
                  <mat-form-field appearance="outline">
                    <mat-label>City</mat-label>
                    <input matInput formControlName="city" />
                    @if (addressGroup.controls.city.invalid && addressGroup.controls.city.touched) {
                      <mat-error>City is required.</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Province / State</mat-label>
                    <input matInput formControlName="province" />
                    @if (addressGroup.controls.province.invalid && addressGroup.controls.province.touched) {
                      <mat-error>Province is required.</mat-error>
                    }
                  </mat-form-field>
                </div>

                <div class="two-col">
                  <mat-form-field appearance="outline">
                    <mat-label>Latitude</mat-label>
                    <input matInput formControlName="lat" type="number"
                      placeholder="6.9271" step="0.0001" />
                    <mat-hint>e.g. 6.9271</mat-hint>
                    @if (addressGroup.controls.lat.invalid && addressGroup.controls.lat.touched) {
                      <mat-error>Enter a valid latitude (−90 to 90).</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Longitude</mat-label>
                    <input matInput formControlName="lng" type="number"
                      placeholder="79.8612" step="0.0001" />
                    <mat-hint>e.g. 79.8612</mat-hint>
                    @if (addressGroup.controls.lng.invalid && addressGroup.controls.lng.touched) {
                      <mat-error>Enter a valid longitude (−180 to 180).</mat-error>
                    }
                  </mat-form-field>
                </div>

                <div class="step-actions">
                  <button mat-stroked-button matStepperPrevious type="button">Back</button>
                  <button mat-flat-button color="primary" matStepperNext
                    type="button" (click)="touchAddress()">
                    Next
                  </button>
                </div>
              </form>
            </mat-step>

            <!-- Step 3: Review & Submit -->
            <mat-step label="Confirm">
              <div class="review-step">
                <h3 class="review-title">Review your details</h3>

                <div class="review-section">
                  <span class="review-label">Salon name</span>
                  <span class="review-value">{{ infoGroup.value.name }}</span>
                </div>
                @if (infoGroup.value.description) {
                  <div class="review-section">
                    <span class="review-label">Description</span>
                    <span class="review-value">{{ infoGroup.value.description }}</span>
                  </div>
                }
                <div class="review-section">
                  <span class="review-label">Phone</span>
                  <span class="review-value">{{ infoGroup.value.phone }}</span>
                </div>
                <div class="review-section">
                  <span class="review-label">Email</span>
                  <span class="review-value">{{ infoGroup.value.email }}</span>
                </div>
                <div class="review-section">
                  <span class="review-label">Address</span>
                  <span class="review-value">
                    {{ addressGroup.value.street }},
                    {{ addressGroup.value.city }},
                    {{ addressGroup.value.province }}
                  </span>
                </div>
                <div class="review-section">
                  <span class="review-label">Coordinates</span>
                  <span class="review-value">
                    {{ addressGroup.value.lat }}, {{ addressGroup.value.lng }}
                  </span>
                </div>

                <p class="review-note">
                  <mat-icon class="note-icon">info</mat-icon>
                  After submission, your salon will be reviewed by an admin before going live.
                  You can add services and operating hours from the dashboard once approved.
                </p>

                <div class="step-actions">
                  <button mat-stroked-button matStepperPrevious type="button"
                    [disabled]="isSubmitting()">Back</button>
                  <button mat-flat-button color="primary" type="button"
                    [disabled]="isSubmitting()" (click)="submit()">
                    @if (isSubmitting()) {
                      <mat-spinner diameter="20" />
                    } @else {
                      Submit for Approval
                    }
                  </button>
                </div>
              </div>
            </mat-step>

          </mat-stepper>
        }

      </div>
    </div>
  `,
  styles: [`
    .register-page {
      min-height: 100%;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 32px 16px;
    }

    .register-card {
      width: 100%;
      max-width: 680px;
      background: #fff;
      border-radius: 16px;
      padding: 32px 36px;
      box-shadow: 0 1px 4px rgba(0,0,0,.08);
    }

    /* Header */
    .register-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 28px;
    }

    .header-icon {
      font-size: 2.2rem;
      width: 2.2rem;
      height: 2.2rem;
      color: #7c3aed;
      margin-top: 4px;
      flex-shrink: 0;
    }

    .register-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 4px;
      color: #111827;
    }

    .register-subtitle {
      font-size: .9rem;
      color: #6b7280;
      margin: 0;
    }

    /* Error banner */
    .error-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #fef2f2;
      border: 1px solid #fca5a5;
      color: #dc2626;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      font-size: .9rem;
    }

    /* Step form */
    .step-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 20px;
    }

    .full { width: 100%; }

    .two-col {
      display: flex;
      gap: 16px;
    }

    .two-col mat-form-field { flex: 1; }

    .step-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 16px;
    }

    /* Review step */
    .review-step { padding-top: 20px; }

    .review-title {
      font-size: 1rem;
      font-weight: 600;
      color: #374151;
      margin: 0 0 16px;
    }

    .review-section {
      display: flex;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
      font-size: .9rem;
    }

    .review-label {
      width: 120px;
      flex-shrink: 0;
      color: #6b7280;
      font-weight: 500;
    }

    .review-value { color: #111827; }

    .review-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: .85rem;
      margin: 20px 0 0;
    }

    .note-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* Success state */
    .success-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 12px;
      padding: 24px 0;
    }

    .success-icon {
      font-size: 3.5rem;
      width: 3.5rem;
      height: 3.5rem;
      color: #16a34a;
    }

    .success-state h2 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #111827;
      margin: 0;
    }

    .success-state p {
      color: #6b7280;
      max-width: 440px;
      line-height: 1.6;
      margin: 0;
    }

    @media (max-width: 600px) {
      .register-card { padding: 24px 16px; }
      .two-col { flex-direction: column; gap: 0; }
      .register-header { flex-direction: column; gap: 8px; }
    }
  `],
})
export class RegisterSalonComponent {
  private readonly fb           = inject(FormBuilder);
  private readonly adminService = inject(SalonAdminService);
  private readonly router       = inject(Router);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly submitted    = signal(false);
  readonly submittedName = signal('');

  readonly infoGroup = this.fb.nonNullable.group({
    name:        ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
    phone:       ['', Validators.required],
    email:       ['', [Validators.required, Validators.email]],
  });

  readonly addressGroup = this.fb.nonNullable.group({
    street:   ['', Validators.required],
    city:     ['', Validators.required],
    province: ['', Validators.required],
    lat:      [null as unknown as number, [Validators.required, latValidator]],
    lng:      [null as unknown as number, [Validators.required, lngValidator]],
  });

  touchInfo(): void {
    this.infoGroup.markAllAsTouched();
  }

  touchAddress(): void {
    this.addressGroup.markAllAsTouched();
  }

  submit(): void {
    this.infoGroup.markAllAsTouched();
    this.addressGroup.markAllAsTouched();
    if (this.infoGroup.invalid || this.addressGroup.invalid) return;

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    const info    = this.infoGroup.getRawValue();
    const address = this.addressGroup.getRawValue();

    this.adminService.createSalon({
      name:        info.name,
      description: info.description || undefined,
      phone:       info.phone,
      email:       info.email,
      address: {
        street:   address.street,
        city:     address.city,
        province: address.province,
        lat:      Number(address.lat),
        lng:      Number(address.lng),
      },
    }).subscribe({
      next: (salon) => {
        this.isSubmitting.set(false);
        this.submittedName.set(salon.name);
        this.submitted.set(true);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const msg = err?.error?.message ?? err?.message ?? 'Failed to create salon. Please try again.';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  goToDashboard(): void {
    void this.router.navigate(['/salon-dashboard', 'bookings']);
  }
}

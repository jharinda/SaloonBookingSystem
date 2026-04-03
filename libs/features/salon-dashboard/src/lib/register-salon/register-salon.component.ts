import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
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
import { DecimalPipe } from '@angular/common';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Stepper, StepList, Step, StepPanels, StepPanel } from 'primeng/stepper';
import { Textarea } from 'primeng/textarea';

import { SalonAdminService } from '@org/shared-data-access';
import type { Salon } from '@org/models';
import {
  LocationPickerComponent,
  SelectedLocation,
} from '../location-picker/location-picker.component';

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
    Button,
    InputText,
    Stepper,
    StepList,
    Step,
    StepPanels,
    StepPanel,
    Textarea,
    LocationPickerComponent,
    DecimalPipe,
  ],
  template: `
    <div class="register-page">
      <div class="register-card">

        <!-- Header -->
        <div class="register-header">
          <i class="pi pi-shop header-icon"></i>
          <div>
            <h1 class="register-title">{{ branchMode() ? 'Add a branch' : 'Register Your Salon' }}</h1>
            <p class="register-subtitle">
              @if (branchMode()) {
                Add a new location to your franchise. It will appear after admin approval.
              } @else {
                Fill in your salon details. Your listing will go live after admin approval.
              }
            </p>
          </div>
        </div>

        <!-- Success state -->
        @if (submitted()) {
          <div class="success-state">
            <i class="pi pi-check-circle success-icon"></i>
            <h2>Salon submitted!</h2>
            <p>
              Your salon <strong>{{ submittedName() }}</strong> has been submitted for review.
              An admin will approve it shortly — you'll be able to manage it from your dashboard once approved.
            </p>
            <p-button label="Go to Dashboard" (onClick)="goToDashboard()" />
          </div>
        } @else {
          <!-- Error banner -->
          @if (errorMessage()) {
            <div class="error-banner" role="alert">
              <i class="pi pi-exclamation-circle"></i>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <!-- Stepper form -->
          <p-stepper [value]="activeStep()">
            <p-step-list>
              <p-step [value]="0">Salon Info</p-step>
              <p-step [value]="1">Location</p-step>
              <p-step [value]="2">Confirm</p-step>
            </p-step-list>

            <p-step-panels>
              <!-- Step 1: Salon Info -->
              <p-step-panel [value]="0">
                <ng-template #content>
                  <form [formGroup]="infoGroup" novalidate class="step-form">

                    <div class="field full">
                      <label for="name">Salon name</label>
                      <input id="name" pInputText formControlName="name" maxlength="100" class="w-full" />
                      @if (infoGroup.controls.name.invalid && infoGroup.controls.name.touched) {
                        <small class="p-error">Salon name is required (max 100 chars).</small>
                      }
                    </div>

                    <div class="field full">
                      <label for="description">Description (optional)</label>
                      <textarea id="description" pTextarea formControlName="description" rows="3"
                        placeholder="Tell clients what makes your salon special…" class="w-full"></textarea>
                    </div>

                    <div class="two-col">
                      <div class="field">
                        <label for="phone">Phone number</label>
                        <div class="p-inputgroup">
                          <span class="p-inputgroup-addon"><i class="pi pi-phone"></i></span>
                          <input id="phone" pInputText formControlName="phone" type="tel" placeholder="+94771234567" />
                        </div>
                        @if (infoGroup.controls.phone.invalid && infoGroup.controls.phone.touched) {
                          <small class="p-error">Phone number is required.</small>
                        }
                      </div>

                      <div class="field">
                        <label for="email">Business email</label>
                        <div class="p-inputgroup">
                          <span class="p-inputgroup-addon"><i class="pi pi-envelope"></i></span>
                          <input id="email" pInputText formControlName="email" type="email" placeholder="salon@example.com" />
                        </div>
                        @if (infoGroup.controls.email.invalid && infoGroup.controls.email.touched) {
                          <small class="p-error">A valid email address is required.</small>
                        }
                      </div>
                    </div>

                    <div class="step-actions">
                      <p-button label="Next" icon="pi pi-arrow-right" iconPos="right" (onClick)="nextFromInfo()" />
                    </div>
                  </form>
                </ng-template>
              </p-step-panel>

              <!-- Step 2: Location -->
              <p-step-panel [value]="1">
                <ng-template #content>
                  <form [formGroup]="addressGroup" novalidate class="step-form">

                    <div class="field full">
                      <label for="street">Street address</label>
                      <div class="p-inputgroup">
                        <span class="p-inputgroup-addon"><i class="pi pi-map-marker"></i></span>
                        <input id="street" pInputText formControlName="street" placeholder="123 Main Street" />
                      </div>
                      @if (addressGroup.controls.street.invalid && addressGroup.controls.street.touched) {
                        <small class="p-error">Street address is required.</small>
                      }
                    </div>

                    <div class="two-col">
                      <div class="field">
                        <label for="city">City</label>
                        <input id="city" pInputText formControlName="city" class="w-full" />
                        @if (addressGroup.controls.city.invalid && addressGroup.controls.city.touched) {
                          <small class="p-error">City is required.</small>
                        }
                      </div>

                      <div class="field">
                        <label for="province">Province / State</label>
                        <input id="province" pInputText formControlName="province" class="w-full" />
                        @if (addressGroup.controls.province.invalid && addressGroup.controls.province.touched) {
                          <small class="p-error">Province is required.</small>
                        }
                      </div>
                    </div>

                    <!-- Map location picker -->
                    <div class="field full">
                      <label>Pin your salon location</label>
                      <small class="hint map-hint">Search for your address or click / drag the marker on the map.</small>
                      <lib-location-picker
                        class="map-picker-wrap"
                        (locationSelected)="onLocationSelected($event)"
                      />
                      @if (addressGroup.controls.lat.invalid && addressGroup.controls.lat.touched) {
                        <small class="p-error">Please select a location on the map.</small>
                      }
                    </div>

                    <!-- Read-only coordinate display -->
                    @if (addressGroup.value.lat && addressGroup.value.lng) {
                      <div class="coords-display">
                        <i class="pi pi-map-marker coords-icon"></i>
                        <span>
                          <strong>{{ addressGroup.value.lat | number:'1.5-5' }},
                          {{ addressGroup.value.lng | number:'1.5-5' }}</strong>
                        </span>
                      </div>
                    }

                    <div class="step-actions">
                      <p-button label="Back" outlined (onClick)="prevStep()" />
                      <p-button label="Next" icon="pi pi-arrow-right" iconPos="right" (onClick)="nextFromAddress()" />
                    </div>
                  </form>
                </ng-template>
              </p-step-panel>

              <!-- Step 3: Confirm -->
              <p-step-panel [value]="2">
                <ng-template #content>
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
                      <i class="pi pi-info-circle note-icon"></i>
                      After submission, your salon will be reviewed by an admin before going live.
                      You can add services and operating hours from the dashboard once approved.
                    </p>

                    <div class="step-actions">
                      <p-button label="Back" outlined [disabled]="isSubmitting()" (onClick)="prevStep()" />
                      <p-button label="Submit for Approval" [loading]="isSubmitting()" (onClick)="submit()" />
                    </div>
                  </div>
                </ng-template>
              </p-step-panel>

            </p-step-panels>
          </p-stepper>
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
      max-width: 820px;
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

    .two-col .field { flex: 1; }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .field label {
      font-size: .875rem;
      font-weight: 500;
      color: #374151;
    }

    .hint {
      font-size: .75rem;
      color: #6b7280;
    }

    .map-hint { margin-bottom: 6px; }

    .map-picker-wrap { display: block; margin-top: 4px; }

    .coords-display {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: .85rem;
    }

    .coords-icon { font-size: .9rem; }

    .w-full { width: 100%; }

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

    :host-context(.app-dark) {
      .register-card { background: #18181b; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
      .register-title { color: #f4f4f5; }
      .register-subtitle { color: #a1a1aa; }
      .error-banner { background: rgba(254,242,242,.06); border-color: #991b1b; color: #f87171; }
      .field label { color: #d4d4d8; }
      .hint { color: #52525b; }
      /* inputgroup addon bg (wraps the pi icons) */
      .p-inputgroup-addon {
        background: #27272a !important;
        border-color: #3f3f46 !important;
        color: #71717a !important;
      }
      .review-title { color: #d4d4d8; }
      .review-section { border-color: #27272a; }
      .review-label { color: #71717a; }
      .review-value { color: #f4f4f5; }
      .review-note { background: rgba(240,253,244,.05); border-color: #166534; color: #4ade80; }
      .success-state h2 { color: #f4f4f5; }
      .success-state p { color: #a1a1aa; }
      .coords-display { background: rgba(240,253,244,.06); border-color: #166534; color: #4ade80; }
    }
  `],
})
export class RegisterSalonComponent {
  private readonly fb           = inject(FormBuilder);
  private readonly adminService = inject(SalonAdminService);
  private readonly router       = inject(Router);

  /** When true, POST /franchise/branches and emit {@link branchCreated} instead of full-page success. */
  readonly branchMode = input(false, { alias: 'branchMode' });
  readonly branchCreated = output<Salon>();

  readonly activeStep    = signal(0);  readonly isSubmitting = signal(false);
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

  onLocationSelected(loc: SelectedLocation): void {
    this.addressGroup.patchValue({ lat: loc.lat, lng: loc.lng });
    // Auto-fill city if currently empty
    if (!this.addressGroup.value.city && loc.city) {
      this.addressGroup.patchValue({ city: loc.city });
    }
    // Auto-fill street if currently empty
    if (!this.addressGroup.value.street && loc.street) {
      this.addressGroup.patchValue({ street: loc.street });
    }
  }

  touchInfo(): void {
    this.infoGroup.markAllAsTouched();
  }

  touchAddress(): void {
    this.addressGroup.markAllAsTouched();
  }

  nextFromInfo(): void {
    this.touchInfo();
    if (this.infoGroup.valid) this.activeStep.set(1);
  }

  nextFromAddress(): void {
    this.touchAddress();
    if (this.addressGroup.valid) this.activeStep.set(2);
  }

  prevStep(): void {
    this.activeStep.update(s => Math.max(0, s - 1));
  }

  submit(): void {
    this.infoGroup.markAllAsTouched();
    this.addressGroup.markAllAsTouched();
    if (this.infoGroup.invalid || this.addressGroup.invalid) return;

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    const info    = this.infoGroup.getRawValue();
    const address = this.addressGroup.getRawValue();

    const dto = {
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
    };

    const request$ = this.branchMode()
      ? this.adminService.addFranchiseBranch(dto)
      : this.adminService.createSalon(dto);

    request$.subscribe({
      next: (salon) => {
        this.isSubmitting.set(false);
        if (this.branchMode()) {
          this.branchCreated.emit(salon);
          return;
        }
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

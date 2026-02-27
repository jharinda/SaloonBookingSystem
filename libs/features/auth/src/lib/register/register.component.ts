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
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';

import { AuthService, RegisterDto } from '@org/shared-data-access';

// ── Cross-field password-match validator ───────────────────────────────────

const passwordMatchValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const pw = group.get('password')?.value as string;
  const confirm = group.get('confirmPassword')?.value as string;
  return pw && confirm && pw !== confirm ? { passwordMismatch: true } : null;
};

@Component({
  selector: 'lib-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRadioModule,
  ],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="auth-title">Create an account</h1>
        <p class="auth-subtitle">Join SnapSalon — it's free.</p>

        <!-- Success banner -->
        @if (successMessage()) {
          <div class="success-banner" role="status">
            <mat-icon>check_circle_outline</mat-icon>
            <span>{{ successMessage() }}</span>
          </div>
        }

        <!-- Server error banner -->
        @if (errorMessage()) {
          <div class="error-banner" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ errorMessage() }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
          <!-- Name row -->
          <div class="name-row">
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>First name</mat-label>
              <input matInput formControlName="firstName" autocomplete="given-name" />
              @if (firstName.invalid && firstName.touched) {
                <mat-error>First name is required.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="half-width">
              <mat-label>Last name</mat-label>
              <input matInput formControlName="lastName" autocomplete="family-name" />
              @if (lastName.invalid && lastName.touched) {
                <mat-error>Last name is required.</mat-error>
              }
            </mat-form-field>
          </div>

          <!-- Email -->
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Email</mat-label>
            <input
              matInput
              type="email"
              formControlName="email"
              placeholder="you@example.com"
              autocomplete="email"
            />
            <mat-icon matSuffix>email</mat-icon>
            @if (email.invalid && email.touched) {
              <mat-error>
                @if (email.hasError('required')) { Email is required. }
                @else if (email.hasError('email')) { Enter a valid email address. }
              </mat-error>
            }
          </mat-form-field>

          <!-- Password -->
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Password</mat-label>
            <input
              matInput
              [type]="showPassword() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="new-password"
            />
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
            >
              <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            @if (password.invalid && password.touched) {
              <mat-error>
                @if (password.hasError('required')) { Password is required. }
                @else if (password.hasError('minlength')) { Password must be at least 8 characters. }
              </mat-error>
            }
          </mat-form-field>

          <!-- Confirm password -->
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Confirm password</mat-label>
            <input
              matInput
              [type]="showPassword() ? 'text' : 'password'"
              formControlName="confirmPassword"
              autocomplete="new-password"
            />
            @if (confirmPassword.touched && form.hasError('passwordMismatch')) {
              <mat-error>Passwords do not match.</mat-error>
            }
          </mat-form-field>

          <!-- Role -->
          <div class="role-section">
            <p class="role-label">I am a…</p>
            <mat-radio-group formControlName="role" class="role-group">
              <div class="role-card" [class.selected]="form.controls.role.value === 'client'">
                <mat-radio-button value="client" color="primary" />
                <div class="role-text">
                  <span class="role-title">Client</span>
                  <span class="role-desc">I want to book appointments</span>
                </div>
              </div>
              <div class="role-card" [class.selected]="form.controls.role.value === 'salon_owner'">
                <mat-radio-button value="salon_owner" color="primary" />
                <div class="role-text">
                  <span class="role-title">Salon Owner</span>
                  <span class="role-desc">I want to list my salon</span>
                </div>
              </div>
            </mat-radio-group>
            @if (form.controls.role.invalid && form.controls.role.touched) {
              <mat-error class="role-error">Please select a role.</mat-error>
            }
          </div>

          <!-- Submit -->
          <button
            mat-flat-button
            color="primary"
            class="full-width submit-btn"
            type="submit"
            [disabled]="isLoading()"
          >
            @if (isLoading()) {
              <mat-spinner diameter="20" />
            } @else {
              Create account
            }
          </button>
        </form>

        <p class="auth-footer">
          Already have an account?
          <a routerLink="/auth/login" class="auth-link">Sign in</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--mat-sys-surface-container-lowest, #f8f8f8);
      padding: 1rem;
    }
    .auth-card {
      width: 100%;
      max-width: 480px;
      background: white;
      border-radius: 16px;
      padding: 2.5rem 2rem;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }
    .auth-title {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 .25rem;
    }
    .auth-subtitle {
      color: var(--mat-sys-on-surface-variant, #666);
      margin: 0 0 1.5rem;
      font-size: .95rem;
    }
    .full-width { width: 100%; }
    .name-row {
      display: flex;
      gap: 1rem;
    }
    .half-width { flex: 1; min-width: 0; }
    .submit-btn {
      height: 48px;
      font-size: 1rem;
      margin-top: .5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .5rem;
    }
    .error-banner {
      display: flex;
      align-items: center;
      gap: .5rem;
      background: var(--mat-sys-error-container, #fde8e8);
      color: var(--mat-sys-on-error-container, #b00020);
      border-radius: 8px;
      padding: .75rem 1rem;
      margin-bottom: 1.25rem;
      font-size: .9rem;
    }
    .success-banner {
      display: flex;
      align-items: center;
      gap: .5rem;
      background: #e8f5e9;
      color: #2e7d32;
      border-radius: 8px;
      padding: .75rem 1rem;
      margin-bottom: 1.25rem;
      font-size: .9rem;
    }
    .role-section {
      margin-bottom: 1.25rem;
    }
    .role-label {
      font-size: .9rem;
      font-weight: 600;
      color: rgba(0,0,0,.6);
      margin: 0 0 .5rem;
    }
    .role-group {
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .role-card {
      display: flex;
      align-items: center;
      gap: .75rem;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      padding: .75rem 1rem;
      cursor: pointer;
      transition: border-color .15s;
      &.selected { border-color: var(--mat-primary, #6200ea); background: #f3eeff; }
    }
    .role-text {
      display: flex;
      flex-direction: column;
    }
    .role-title { font-weight: 600; font-size: .95rem; }
    .role-desc { font-size: .8rem; color: #666; }
    .role-error { font-size: 12px; color: var(--mat-sys-error, #b00020); margin-top: .25rem; display: block; }
    .auth-footer {
      text-align: center;
      margin-top: 1.5rem;
      font-size: .9rem;
      color: #666;
    }
    .auth-link { color: var(--mat-primary, #6200ea); font-weight: 600; text-decoration: none; }
  `],
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  // ── State signals ──────────────────────────────────────────────────────────
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  // ── Form ───────────────────────────────────────────────────────────────────
  readonly form = this.fb.nonNullable.group(
    {
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
      role: ['', Validators.required],
    },
    { validators: passwordMatchValidator },
  );

  get firstName() { return this.form.controls.firstName; }
  get lastName() { return this.form.controls.lastName; }
  get email() { return this.form.controls.email; }
  get password() { return this.form.controls.password; }
  get confirmPassword() { return this.form.controls.confirmPassword; }

  // ── Submit ─────────────────────────────────────────────────────────────────
  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading()) return;

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const raw = this.form.getRawValue();
    const dto: RegisterDto = {
      firstName: raw.firstName,
      lastName: raw.lastName,
      email: raw.email,
      password: raw.password,
      role: raw.role,
    };
    this.authService.register(dto).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.successMessage.set('Account created! Redirecting you...');
        setTimeout(() => this.router.navigate(['/discover']), 2000);
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.isLoading.set(false);
        if (err?.status === 409) {
          this.errorMessage.set('An account with this email already exists.');
        } else if (err?.error?.message) {
          this.errorMessage.set(err.error.message);
        } else {
          this.errorMessage.set('Something went wrong. Please try again later.');
        }
      },
    });
  }
}

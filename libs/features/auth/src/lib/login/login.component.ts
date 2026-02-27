import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '@org/shared-data-access';

@Component({
  selector: 'lib-login',
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
  ],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="auth-title">Welcome back</h1>
        <p class="auth-subtitle">Sign in to your SnapSalon account</p>

        <!-- Server error banner -->
        @if (errorMessage()) {
          <div class="error-banner" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ errorMessage() }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
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
              autocomplete="current-password"
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
              Sign in
            }
          </button>
        </form>

        <!-- Divider -->
        <div class="divider"><span>or</span></div>

        <!-- Google OAuth -->
        <a
          mat-stroked-button
          class="full-width google-btn"
          href="/api/auth/google"
        >
          <svg viewBox="0 0 24 24" class="google-icon" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </a>

        <!-- Register link -->
        <p class="auth-footer">
          Don't have an account?
          <a routerLink="/auth/register" class="auth-link">Register</a>
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
      max-width: 420px;
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
    .divider {
      display: flex;
      align-items: center;
      gap: .75rem;
      margin: 1.5rem 0;
      color: #bbb;
      font-size: .85rem;
      &::before, &::after { content: ''; flex: 1; height: 1px; background: #e5e5e5; }
    }
    .google-btn {
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .625rem;
    }
    .google-icon { width: 18px; height: 18px; }
    .auth-footer {
      text-align: center;
      margin-top: 1.5rem;
      font-size: .9rem;
      color: #666;
    }
    .auth-link { color: var(--mat-primary, #6200ea); font-weight: 600; text-decoration: none; }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  // ── State signals ──────────────────────────────────────────────────────────
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  // ── Form ───────────────────────────────────────────────────────────────────
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  get email() { return this.form.controls.email; }
  get password() { return this.form.controls.password; }

  // ── Submit ─────────────────────────────────────────────────────────────────
  onSubmit(): void {
    if (this.form.invalid || this.isLoading()) return;

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const { email, password } = this.form.getRawValue();
    this.authService.login(email, password).subscribe({
      next: () => {
        this.isLoading.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/discover';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (err: { status?: number }) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.status === 401 ? 'Invalid credentials. Please try again.' : 'Something went wrong. Please try again later.',
        );
      },
    });
  }
}

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
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';

import { ButtonModule } from 'primeng/button';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

import { AuthService } from '@org/shared-data-access';

const passwordsMatchValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const newPassword     = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword
    ? { passwordsMismatch: true }
    : null;
};

@Component({
  selector: 'lib-reset-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    FloatLabelModule,
    InputTextModule,
    PasswordModule,
  ],
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent {
  private readonly fb          = inject(FormBuilder);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly msgSvc      = inject(MessageService);

  readonly isLoading    = signal(false);
  readonly errorMessage = signal<string | null>(null);

  /** Pre-fill from the query param set by the forgot-password step. */
  readonly prefillEmail = this.route.snapshot.queryParamMap.get('email') ?? '';

  readonly form = this.fb.nonNullable.group(
    {
      email:           [this.prefillEmail, [Validators.required, Validators.email]],
      otp:             ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      newPassword:     ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator },
  );

  get email()           { return this.form.controls.email; }
  get otp()             { return this.form.controls.otp; }
  get newPassword()     { return this.form.controls.newPassword; }
  get confirmPassword() { return this.form.controls.confirmPassword; }
  get passwordsMismatch() {
    return (
      this.form.hasError('passwordsMismatch') &&
      this.confirmPassword.touched
    );
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading()) return;

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const { email, otp, newPassword } = this.form.getRawValue();

    this.authService.resetPassword(email, otp, newPassword).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.msgSvc.add({
          severity: 'success',
          summary:  'Password reset',
          detail:   'Your password has been updated. Please sign in.',
          life:     5000,
        });
        void this.router.navigate(['/auth/login']);
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.isLoading.set(false);
        if (err?.status === 400) {
          this.errorMessage.set(
            err.error?.message ?? 'Invalid or expired code. Please request a new one.',
          );
        } else {
          this.errorMessage.set('Something went wrong. Please try again later.');
        }
      },
    });
  }
}

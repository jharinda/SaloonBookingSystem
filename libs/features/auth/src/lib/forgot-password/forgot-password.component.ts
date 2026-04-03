import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService } from '@org/shared-data-access';

@Component({
  selector: 'lib-forgot-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    FloatLabelModule,
    InputTextModule,
  ],
  templateUrl: './forgot-password.component.html',
  styles: [`:host { display: block; height: 100%; }`],
})
export class ForgotPasswordComponent {
  private readonly fb          = inject(FormBuilder);
  private readonly router      = inject(Router);
  private readonly authService = inject(AuthService);

  readonly isLoading    = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly sent         = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  get email() { return this.form.controls.email; }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading()) return;

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const { email } = this.form.getRawValue();

    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.isLoading.set(false);
        void this.router.navigate(['/auth/reset-password'], {
          queryParams: { email },
        });
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Something went wrong. Please try again later.');
      },
    });
  }
}

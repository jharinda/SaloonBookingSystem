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
import { HttpErrorResponse } from '@angular/common/http';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { FloatLabelModule } from 'primeng/floatlabel';
import { DividerModule } from 'primeng/divider';

import { AuthService } from '@org/shared-data-access';

@Component({
  selector: 'lib-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    FloatLabelModule,
    DividerModule,
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb          = inject(FormBuilder);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  readonly isLoading    = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    const err = this.route.snapshot.queryParamMap.get('error');
    if (err === 'not_registered') {
      this.errorMessage.set(
        'No account found for this Google account. Please register first.',
      );
    }
  }

  readonly form = this.fb.nonNullable.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  get email()    { return this.form.controls.email; }
  get password() { return this.form.controls.password; }

  loginWithGoogle(): void {
    window.location.href = '/api/auth/google/init?intent=login';
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
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
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false);
        // Show the actual error message from the backend
        const message = err?.error?.message || err?.message;
        this.errorMessage.set(
          message || 'Something went wrong. Please try again later.'
        );
      },
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectButtonModule } from 'primeng/selectbutton';
import { DividerModule } from 'primeng/divider';

import { AuthService, RegisterDto } from '@org/shared-data-access';

@Component({
  selector: 'lib-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    FloatLabelModule,
    InputTextModule,
    PasswordModule,
    SelectButtonModule,
    DividerModule,
  ],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly fb          = inject(FormBuilder);
  private readonly router      = inject(Router);
  private readonly authService = inject(AuthService);

  readonly isLoading    = signal(false);
  readonly errorMessage = signal<string | null>(null);

  accountType: 'client' | 'owner' = 'client';
  agreedToTerms = false;

  readonly accountTypeOptions = [
    { label: 'I am a Client', value: 'client' },
    { label: 'I own a Salon', value: 'owner' },
  ];

  readonly form = this.fb.nonNullable.group({
    fullName:  ['', Validators.required],
    email:     ['', [Validators.required, Validators.email]],
    password:  ['', [Validators.required, Validators.minLength(8)]],
    salonName: [''],
  });

  get fullName()  { return this.form.controls.fullName; }
  get email()     { return this.form.controls.email; }
  get password()  { return this.form.controls.password; }
  get salonName() { return this.form.controls.salonName; }

  loginWithGoogle(): void {
    window.location.href = '/api/auth/google/init?intent=register';
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading() || !this.agreedToTerms) return;

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const raw = this.form.getRawValue();
    const parts = raw.fullName.trim().split(' ');
    const firstName = parts[0] ?? '';
    const lastName  = parts.slice(1).join(' ') || firstName;

    const dto: RegisterDto = {
      firstName,
      lastName,
      email:    raw.email,
      password: raw.password,
      role:     this.accountType === 'owner' ? 'salon_owner' : 'client',
    };

    this.authService.register(dto).subscribe({
      next: () => {
        this.isLoading.set(false);
        void this.router.navigate(['/discover']);
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.isLoading.set(false);
        if (err?.status === 409) {
          this.errorMessage.set('An account with this email already exists.');
        } else {
          this.errorMessage.set(err?.error?.message ?? 'Something went wrong. Please try again later.');
        }
      },
    });
  }
}

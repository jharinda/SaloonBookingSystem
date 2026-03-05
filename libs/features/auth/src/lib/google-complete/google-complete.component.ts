import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';

import { AuthService } from '@org/shared-data-access';

interface CompleteResponse {
  accessToken: string;
}

@Component({
  selector: 'lib-google-complete',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ButtonModule, SelectButtonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-8">
      <div class="w-full max-w-md">

        <div class="flex items-center gap-3 mb-2">
          <i class="pi pi-google text-2xl text-zinc-500"></i>
          <h2 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100 m-0">One last step</h2>
        </div>
        <p class="text-zinc-500 mt-1 mb-8">
          How will you be using SnapSalon? You can't change this later.
        </p>

        @if (error()) {
          <div class="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm" role="alert">
            <i class="pi pi-exclamation-circle shrink-0"></i>
            <span>{{ error() }}</span>
          </div>
        }

        @if (!pendingToken()) {
          <p class="text-red-600 text-sm">No registration token found.
            <a routerLink="/auth/register" class="underline">Start over</a>
          </p>
        } @else {
          <p-selectButton
            [(ngModel)]="selectedRole"
            [options]="roleOptions"
            optionLabel="label"
            optionValue="value"
            styleClass="w-full mb-8"
          />

          <div class="flex flex-col gap-3 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
            @if (selectedRole === 'client') {
              <p class="m-0">
                <i class="pi pi-calendar-clock mr-2 text-emerald-600"></i>
                Book appointments at 500+ verified salons.
              </p>
            } @else {
              <p class="m-0">
                <i class="pi pi-shop mr-2 text-emerald-600"></i>
                List your salon and manage bookings.
              </p>
            }
          </div>

          <p-button
            label="Create my account"
            severity="success"
            icon="pi pi-check"
            iconPos="left"
            styleClass="w-full justify-center"
            [loading]="isLoading()"
            (onClick)="complete()"
          />

          <p class="text-center text-xs text-zinc-400 mt-4 mb-0">
            By continuing you agree to our
            <a routerLink="/terms" class="text-emerald-600 hover:underline">Terms</a>
            and
            <a routerLink="/privacy" class="text-emerald-600 hover:underline">Privacy Policy</a>.
          </p>
        }

      </div>
    </div>
  `,
})
export class GoogleCompleteComponent implements OnInit {
  private readonly route       = inject(ActivatedRoute);
  private readonly router      = inject(Router);
  private readonly http        = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly pendingToken = signal<string | null>(null);
  readonly isLoading    = signal(false);
  readonly error        = signal<string | null>(null);

  selectedRole: 'client' | 'salon_owner' = 'client';

  readonly roleOptions = [
    { label: 'I am a Client',  value: 'client' },
    { label: 'I own a Salon',  value: 'salon_owner' },
  ];

  ngOnInit(): void {
    const token = this.route.snapshot.queryParams['pendingToken'] as string | undefined;
    if (token) {
      this.pendingToken.set(token);
    } else {
      void this.router.navigate(['/auth/register']);
    }
  }

  complete(): void {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    this.error.set(null);

    this.http
      .post<CompleteResponse>('/api/auth/google/complete', {
        pendingToken: this.pendingToken(),
        role: this.selectedRole,
      }, { withCredentials: true })
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.authService.setAccessToken(res.accessToken);
          const redirectUrl = sessionStorage.getItem('auth_redirect_url') ?? '/discover';
          sessionStorage.removeItem('auth_redirect_url');
          void this.router.navigateByUrl(redirectUrl);
        },
        error: (err: { status?: number; error?: { message?: string } }) => {
          this.isLoading.set(false);
          this.error.set(
            err?.status === 401
              ? 'Your session expired. Please sign in with Google again.'
              : (err?.error?.message ?? 'Something went wrong. Please try again.'),
          );
        },
      });
  }
}

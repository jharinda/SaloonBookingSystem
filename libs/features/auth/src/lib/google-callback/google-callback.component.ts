import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { AuthService } from '@org/shared-data-access';

const REDIRECT_KEY = 'auth_redirect_url';

@Component({
  selector: 'lib-google-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressSpinnerModule],
  styles: [`:host { display: block; height: 100%; }`],
  template: `
    <div class="min-h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <p-progressSpinner strokeWidth="4" styleClass="w-12 h-12" />
    </div>
  `,
})
export class GoogleCallbackComponent implements OnInit {
  private readonly route       = inject(ActivatedRoute);
  private readonly router      = inject(Router);
  private readonly authService = inject(AuthService);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParams['token'] as string | undefined;

    if (token) {
      this.authService.setAccessToken(token);

      const redirectUrl = sessionStorage.getItem(REDIRECT_KEY) ?? '/discover';
      sessionStorage.removeItem(REDIRECT_KEY);

      void this.router.navigateByUrl(redirectUrl);
    } else {
      void this.router.navigate(['/auth/login'], {
        queryParams: { error: 'oauth_failed' },
      });
    }
  }
}

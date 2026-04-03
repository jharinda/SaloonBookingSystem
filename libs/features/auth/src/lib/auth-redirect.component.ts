import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Resolves `/auth` with optional query params: salon signup → register, else login.
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class AuthRedirectComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const role = this.route.snapshot.queryParamMap.get('role');
    const keys = this.route.snapshot.queryParamMap.keys;
    const queryParams: Record<string, string> = {};
    for (const k of keys) {
      const v = this.route.snapshot.queryParamMap.get(k);
      if (v !== null) queryParams[k] = v;
    }
    const target =
      role === 'salon_owner' || role === 'franchise_owner'
        ? '/auth/register'
        : '/auth/login';
    void this.router.navigate([target], { queryParams });
  }
}

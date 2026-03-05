import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterOutlet } from '@angular/router';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Button } from 'primeng/button';

import { AuthService, SalonAdminService } from '@org/shared-data-access';
import { Salon } from '@org/models';
import { DashboardSidebarComponent } from '../components/sidebar/dashboard-sidebar.component';

@Component({
  selector: 'lib-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    ProgressSpinner,
    Button,
    DashboardSidebarComponent,
  ],
  templateUrl: './dashboard-home.component.html',
  styles: [`:host { display: block; }`],
})
export class DashboardHomeComponent implements OnInit {
  private readonly authService  = inject(AuthService);
  private readonly adminService = inject(SalonAdminService);
  private readonly router       = inject(Router);

  readonly salon       = signal<Salon | null>(null);
  readonly isLoading   = signal(true);
  readonly loadError   = signal<string | null>(null);
  readonly isExpanded  = signal(false);

  readonly isOwner   = computed(() => this.authService.getUserRole() === 'salon_owner');
  readonly userEmail = computed(() => this.authService.currentUser()?.email ?? '');

  ngOnInit(): void {
    if (!this.isOwner()) {
      this.isLoading.set(false);
      return;
    }
    this.loadSalon();
  }

  loadSalon(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.adminService.getOwnSalon().subscribe({
      next: (s) => { this.salon.set(s); this.isLoading.set(false); },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.isLoading.set(false);
          void this.router.navigate(['/salon-dashboard', 'register']);
          return;
        }
        this.loadError.set('Could not load your salon. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => void this.router.navigate(['/auth', 'login']),
      error:    () => void this.router.navigate(['/auth', 'login']),
    });
  }
}


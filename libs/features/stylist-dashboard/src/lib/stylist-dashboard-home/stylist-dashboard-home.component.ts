import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Button } from 'primeng/button';

import { AuthService, UserService, UserProfile } from '@org/shared-data-access';
import { StylistSidebarComponent } from '../components/sidebar/stylist-sidebar.component';

@Component({
  selector: 'lib-stylist-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ProgressSpinner, Button, StylistSidebarComponent],
  templateUrl: './stylist-dashboard-home.component.html',
  styles: [`:host { display: block; }`],
})
export class StylistDashboardHomeComponent implements OnInit {
  private readonly authService  = inject(AuthService);
  private readonly userService  = inject(UserService);
  private readonly router       = inject(Router);

  readonly profile     = signal<UserProfile | null>(null);
  readonly isLoading   = signal(true);
  readonly loadError   = signal<string | null>(null);
  readonly isExpanded  = signal(false);
  readonly pendingInvitations = signal(0);

  readonly isStylist = computed(() => this.authService.getUserRole() === 'stylist');
  readonly userEmail = computed(() => this.authService.currentUser()?.email ?? '');
  readonly stylistName = computed(() => {
    const p = this.profile();
    if (!p) return null;
    return `${p.firstName} ${p.lastName}`.trim() || p.email.split('@')[0];
  });

  ngOnInit(): void {
    if (!this.isStylist()) {
      this.isLoading.set(false);
      return;
    }
    this.loadProfile();
    this.loadPendingCount();
  }

  loadProfile(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.userService.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load your profile. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  loadPendingCount(): void {
    this.userService.getStylistInvitations().subscribe({
      next: (invitations) => {
        const pending = invitations.filter((i) => i.status === 'pending');
        this.pendingInvitations.set(pending.length);
      },
      error: () => { /* Silently ignore */ },
    });
  }

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => void this.router.navigate(['/auth', 'login']),
      error:    () => void this.router.navigate(['/auth', 'login']),
    });
  }
}

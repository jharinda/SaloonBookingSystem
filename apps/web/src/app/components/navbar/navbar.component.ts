import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '@org/shared-data-access';

@Component({
  selector: 'app-navbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private routerSub?: Subscription;

  /** Whether the user is authenticated. */
  readonly isLoggedIn = this.authService.isLoggedIn;

  /**
   * Derived user info for the navbar.
   * Note: the JWT payload does not include `firstName`, so we derive a display
   * name from the email prefix. Extend JwtPayload and the token claims to add
   * firstName if needed.
   */
  readonly currentUser = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return null;
    return {
      firstName: user.email.split('@')[0],
      role: user.role,
    };
  });

  /** First letter of the user's email to display in the avatar circle. */
  readonly userInitial = computed(() => {
    const user = this.authService.currentUser();
    return user ? user.email.charAt(0).toUpperCase() : '';
  });

  /** Controls the mobile side drawer. */
  readonly drawerOpen = signal(false);

  ngOnInit(): void {
    // Close the mobile drawer whenever the route changes.
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.drawerOpen.set(false));
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  toggleDrawer(): void {
    this.drawerOpen.update((v) => !v);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  logout(): void {
    this.closeDrawer();
    this.authService.logout().subscribe({
      complete: () => void this.router.navigate(['/discover']),
      error: () => void this.router.navigate(['/discover']),
    });
  }
}

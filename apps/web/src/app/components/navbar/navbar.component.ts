import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';

import { AuthService } from '@org/shared-data-access';

const THEME_KEY = 'snapsalon-theme';

@Component({
  selector: 'app-navbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Menubar, Button, Menu],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private routerSub?: Subscription;

  readonly isDark = signal(false);

  readonly isLoggedIn = this.authService.isLoggedIn;

  readonly currentUser = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return null;
    return { displayName: user.email.split('@')[0], role: user.role };
  });

  readonly userInitial = computed(() => {
    const user = this.authService.currentUser();
    return user ? user.email.charAt(0).toUpperCase() : '';
  });

  /** Main nav items — rebuilt whenever auth state changes */
  readonly menuItems = computed<MenuItem[]>(() => {
    const user = this.currentUser();
    const items: MenuItem[] = [
      { label: 'Discover', icon: 'pi pi-search', routerLink: '/discover' },
    ];

    if (user?.role === 'client') {
      items.push({ label: 'My Bookings', icon: 'pi pi-calendar', routerLink: '/my-appointments' });
    }

    if (user?.role === 'salon_owner' || user?.role === 'franchise_owner') {
      items.push({ label: 'Dashboard', icon: 'pi pi-gauge', routerLink: '/salon-dashboard' });
    }

    if (user?.role === 'admin') {
      items.push({ label: 'Admin', icon: 'pi pi-shield', routerLink: '/admin' });
    }

    return items;
  });

  /** User dropdown items */
  readonly userMenuItems = computed<MenuItem[]>(() => [
    { label: 'My Profile', icon: 'pi pi-user', routerLink: '/account' },
    { separator: true },
    { label: 'Logout', icon: 'pi pi-sign-out', command: () => this.logout() },
  ]);

  ngOnInit(): void {
    this.routerSub = this.router.events
      .pipe(filter((e) => e.constructor.name === 'NavigationEnd'))
      .subscribe(() => { /* menus auto-close on nav */ });

    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem(THEME_KEY);
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const dark = saved ? saved === 'dark' : prefersDark;
      this.isDark.set(dark);
      this.doc.documentElement.classList.toggle('dark', dark);
      this.doc.documentElement.classList.toggle('app-dark', dark);
    }
  }

  toggleDarkMode(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    this.doc.documentElement.classList.toggle('dark', next);
    this.doc.documentElement.classList.toggle('app-dark', next);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => void this.router.navigate(['/discover']),
      error: () => void this.router.navigate(['/discover']),
    });
  }
}

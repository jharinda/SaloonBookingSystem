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
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';

import { AuthService, UserService, LanguageService } from '@org/shared-data-access';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

const THEME_KEY = 'snapsalon-theme';

@Component({
  selector: 'app-navbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Menubar, Button, Menu, NotificationBellComponent, TranslateModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly languageService = inject(LanguageService);
  private readonly translateService = inject(TranslateService);
  protected readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private routerSub?: Subscription;

  readonly isDark = signal(false);
  readonly currentUrl = signal(this.router.url);

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

  /** Profile avatar URL from the shared user profile state. */
  readonly avatarUrl = this.userService.avatarUrl;

  /** Main nav items — rebuilt whenever auth state or URL changes */
  readonly menuItems = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [];

    return items;
  });

  /** User dropdown items — recomputed when language changes */
  readonly userMenuItems = computed<MenuItem[]>(() => {
    const user = this.currentUser();
    const url  = this.currentUrl();
    // Depend on currentLang so items recompute on language switch
    void this.languageService.currentLang();
    const t = (key: string) => this.translateService.instant(key);
    const onDashboard = url.startsWith('/salon-dashboard');
    const onStylistDashboard = url.startsWith('/stylist-dashboard');
    const items: MenuItem[] = [
      { label: t('nav.myProfile'), icon: 'pi pi-user', routerLink: '/account' },
    ];

    if (user?.role === 'client') {
      items.push({ label: t('nav.myBookings'), icon: 'pi pi-calendar', routerLink: '/my-appointments' });
    }

    if ((user?.role === 'salon_owner' || user?.role === 'franchise_owner') && !onDashboard) {
      items.push({ label: t('nav.dashboard'), icon: 'pi pi-gauge', routerLink: '/salon-dashboard' });
    }

    if (user?.role === 'stylist' && !onStylistDashboard) {
      items.push({ label: t('nav.dashboard'), icon: 'pi pi-gauge', routerLink: '/stylist-dashboard' });
    }

    if (user?.role === 'admin') {
      items.push({ label: t('nav.adminDashboard'), icon: 'pi pi-shield', routerLink: '/admin' });
    }

    items.push({ separator: true });
    items.push({ label: t('common.logout'), icon: 'pi pi-sign-out', command: () => this.logout() });

    return items;
  });

  ngOnInit(): void {
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
      });

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
      complete: () => { this.userService.clearProfile(); void this.router.navigate(['/discover']); },
      error: () => { this.userService.clearProfile(); void this.router.navigate(['/discover']); },
    });
  }
}

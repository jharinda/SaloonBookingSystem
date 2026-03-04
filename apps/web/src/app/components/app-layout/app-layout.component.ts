import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenubarModule } from 'primeng/menubar';
import { Toast } from 'primeng/toast';
import { Drawer } from 'primeng/drawer';
import { PanelMenu } from 'primeng/panelmenu';

const THEME_KEY = 'snapsalon-theme';

@Component({
  selector: 'app-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [RouterOutlet, ButtonModule, MenubarModule, Toast, Drawer, PanelMenu],
  template: `
    <div class="app-shell">

      <!-- ── Top bar ──────────────────────────────────────────────── -->
      <header class="app-topbar">
        <!-- Hamburger: only on mobile (below lg) -->
        <button
          pButton
          type="button"
          icon="pi pi-bars"
          [text]="true"
          [rounded]="true"
          severity="secondary"
          size="small"
          class="lg:hidden"
          aria-label="Open navigation"
          (click)="sidebarVisible = true"
        ></button>

        <span class="app-topbar__brand">SnapSalon</span>

        <!-- Desktop nav: hidden below lg -->
        <p-menubar
          [model]="menuItems"
          styleClass="hidden lg:flex border-0 bg-transparent"
        />

        <button
          pButton
          type="button"
          [icon]="isDark ? 'pi pi-sun' : 'pi pi-moon'"
          [text]="true"
          [rounded]="true"
          severity="secondary"
          size="small"
          [attr.aria-label]="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          (click)="toggleDarkMode()"
        ></button>
      </header>

      <!-- ── Mobile navigation drawer ─────────────────────────────── -->
      <p-drawer
        [(visible)]="sidebarVisible"
        position="left"
        [style]="{'width':'280px'}"
        header="SnapSalon"
      >
        <p-panelmenu [model]="menuItems" styleClass="mobile-nav-menu" />
      </p-drawer>

      <!-- ── Page content ─────────────────────────────────────────── -->
      <main class="app-content">
        <router-outlet />
      </main>

      <p-toast [breakpoints]="{'920px': {width: '100%', right: '0', left: '0'}}" />

    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .app-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.5rem;
      height: 56px;
      background: var(--p-surface-0);
      border-bottom: 1px solid var(--p-surface-200);
    }

    .app-topbar__brand {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--p-primary-500);
      letter-spacing: -0.01em;
    }

    .app-content {
      flex: 1;
      width: 100%;
    }
  `],
})
export class AppLayoutComponent implements OnInit {

  isDark = false;
  sidebarVisible = false;

  readonly menuItems: MenuItem[] = [
    {
      label: 'Discover',
      icon: 'pi pi-search',
      routerLink: '/discover',
    },
    {
      label: 'My Bookings',
      icon: 'pi pi-calendar',
      routerLink: '/bookings',
    },
    {
      label: 'For Salon Owners',
      items: [
        { label: 'Dashboard',    routerLink: '/dashboard' },
        { label: 'Appointments', routerLink: '/dashboard/appointments' },
        { label: 'Services',     routerLink: '/dashboard/services' },
        { label: 'Staff',        routerLink: '/dashboard/staff' },
        { label: 'Settings',     routerLink: '/dashboard/settings' },
      ],
    },
  ];

  ngOnInit(): void {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') {
      this.isDark = true;
      document.documentElement.classList.add('app-dark');
    }
  }

  toggleDarkMode(): void {
    this.isDark = !this.isDark;

    if (this.isDark) {
      document.documentElement.classList.add('app-dark');
      localStorage.setItem(THEME_KEY, 'dark');
    } else {
      document.documentElement.classList.remove('app-dark');
      localStorage.setItem(THEME_KEY, 'light');
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NgClass } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, skip, switchMap, tap } from 'rxjs/operators';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Button } from 'primeng/button';
import { AuthService, SalonAdminService, SALON_DASHBOARD_BRANCH_ID_KEY } from '@org/shared-data-access';
import { Salon } from '@org/models';
import { DashboardSidebarComponent } from '../components/sidebar/dashboard-sidebar.component';
import { BranchSelectorComponent } from '../components/branch-selector/branch-selector.component';

@Component({
  selector: 'lib-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    ProgressSpinner,
    Button,
    NgClass,
    DashboardSidebarComponent,
    BranchSelectorComponent,
  ],
  templateUrl: './dashboard-home.component.html',
  styles: [`:host { display: block; height: 100%; }`],
})
export class DashboardHomeComponent implements OnInit {
  private readonly authService         = inject(AuthService);
  private readonly adminService        = inject(SalonAdminService);
  private readonly router              = inject(Router);
  private readonly destroyRef          = inject(DestroyRef);
  private readonly breakpointObserver  = inject(BreakpointObserver);

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 767px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly salon       = signal<Salon | null>(null);
  readonly franchiseBranches = signal<Salon[]>([]);
  readonly isLoading   = signal(true);
  readonly loadError   = signal<string | null>(null);
  readonly isExpanded  = signal(false);

  readonly isOwner = computed(() => {
    const r = this.authService.getUserRole();
    return r === 'salon_owner' || r === 'franchise_owner';
  });

  readonly isFranchiseOwner = computed(() => this.authService.getUserRole() === 'franchise_owner');

  /** Left-margin class for the main content area — removed on mobile to make room for bottom nav. */
  readonly mainMarginClass = computed(() => {
    if (this.isMobile()) return 'pb-20';
    return this.isExpanded() ? 'ml-56' : 'ml-20';
  });

  readonly userEmail = computed(() => this.authService.currentUser()?.email ?? '');

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.authService.getUserRole() !== 'franchise_owner') return;
        this.adminService.getDashboardSalon().subscribe({
          next: (s) => this.salon.set(s),
          error: () => {},
        });
      });
  }

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

    const role = this.authService.getUserRole();
    if (role === 'franchise_owner') {
      this.adminService
        .getFranchiseBranches()
        .pipe(
          tap((branches) => this.franchiseBranches.set(branches)),
          switchMap((branches) => {
            if (branches.length === 0) {
              this.adminService.setDashboardSalonId(null);
              return this.adminService.getOwnSalon();
            }
            const stored =
              typeof sessionStorage !== 'undefined'
                ? sessionStorage.getItem(SALON_DASHBOARD_BRANCH_ID_KEY)
                : null;
            const pick =
              stored && branches.some((b) => b._id === stored)
                ? stored
                : branches[0]._id;
            this.adminService.setDashboardSalonId(pick);
            return this.adminService.getDashboardSalon();
          }),
        )
        .subscribe({
          next: (s) => {
            this.salon.set(s);
            this.isLoading.set(false);
          },
          error: (err: HttpErrorResponse) => this._handleSalonLoadError(err),
        });
      return;
    }

    this.adminService.setDashboardSalonId(null);
    this.adminService.getOwnSalon().subscribe({
      next: (s) => {
        this.salon.set(s);
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => this._handleSalonLoadError(err),
    });
  }

  onBranchChanged(salon: Salon): void {
    this.salon.set(salon);
  }

  private _handleSalonLoadError(err: HttpErrorResponse): void {
    if (err.status === 404) {
      this.isLoading.set(false);
      void this.router.navigate(['/salon-dashboard', 'register']);
      return;
    }
    this.loadError.set('Could not load your salon. Please try again.');
    this.isLoading.set(false);
  }

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => void this.router.navigate(['/auth', 'login']),
      error:    () => void this.router.navigate(['/auth', 'login']),
    });
  }
}


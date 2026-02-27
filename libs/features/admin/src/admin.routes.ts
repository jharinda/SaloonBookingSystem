import { Route } from '@angular/router';

export const ADMIN_ROUTES: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./lib/admin-layout/admin-layout.component').then(
        (m) => m.AdminLayoutComponent,
      ),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./lib/dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },
      {
        path: 'approvals',
        loadComponent: () =>
          import('./lib/salon-approvals/salon-approvals.component').then(
            (m) => m.SalonApprovalsComponent,
          ),
      },
      {
        path: 'salons',
        loadComponent: () =>
          import('./lib/all-salons/all-salons.component').then(
            (m) => m.AllSalonsComponent,
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./lib/users/admin-users.component').then(
            (m) => m.AdminUsersComponent,
          ),
      },
      {
        path: 'reviews',
        loadComponent: () =>
          import('./lib/reviews/admin-reviews.component').then(
            (m) => m.AdminReviewsComponent,
          ),
      },
    ],
  },
];

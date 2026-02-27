import { Route } from '@angular/router';
import { authGuard, roleGuard } from './guards/auth.guard';

export const appRoutes: Route[] = [
  // Home / landing page
  {
    path: '',
    loadComponent: () =>
      import('./app.component').then((m) => m.HomeComponent),
    pathMatch: 'full',
  },

  // Auth (login / register) — lazy-loaded from @org/auth lib
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Discover salons — public
  {
    path: 'discover',
    loadComponent: () =>
      import('@org/discover').then((m) => m.SalonSearchComponent),
  },

  // Booking wizard — protected, lazy children
  {
    path: 'booking',
    canActivate: [authGuard],
    loadChildren: () =>
      import('@org/booking').then((m) => m.BOOKING_ROUTES),
  },

  // Salon owner dashboard — protected + role-gated
  {
    path: 'salon-dashboard',
    canActivate: [authGuard, roleGuard('salon_owner')],
    loadComponent: () =>
      import('@org/salon-dashboard').then((m) => m.SalonDashboard),
  },

  // Reviews — public read
  {
    path: 'reviews',
    loadComponent: () =>
      import('@org/reviews').then((m) => m.Reviews),
  },

  // Account / profile — auth required
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shared/placeholder.component').then(
        (m) => m.PlaceholderComponent
      ),
  },

  // Wildcard fallback
  { path: '**', redirectTo: '/discover' },
];

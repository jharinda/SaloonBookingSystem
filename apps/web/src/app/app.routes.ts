import { Route } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { redirectIfAuthenticatedGuard } from './guards/redirect-if-authenticated.guard';

export const appRoutes: Route[] = [
  // Home / landing page
  {
    path: '',
    loadComponent: () =>
      import('./app.component').then((m) => m.HomeComponent),
    pathMatch: 'full',
  },

  // Auth (login / register) — guest only; authenticated users are bounced to /discover
  {
    path: 'auth',
    canActivate: [redirectIfAuthenticatedGuard],
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Discover salons — public
  {
    path: 'discover',
    loadComponent: () =>
      import('@org/discover').then((m) => m.SalonSearchComponent),
  },

  // Salon detail page — public
  {
    path: 'discover/:salonId',
    loadComponent: () =>
      import('@org/discover').then((m) => m.SalonDetailComponent),
  },

  // Booking wizard — protected
  {
    path: 'booking',
    canActivate: [authGuard],
    loadChildren: () =>
      import('@org/booking').then((m) => m.BOOKING_ROUTES),
  },

  // My Appointments — client/any authenticated user
  {
    path: 'my-appointments',
    canActivate: [authGuard],
    loadComponent: () =>
      import('@org/booking').then((m) => m.MyAppointmentsComponent),
  },

  // Account / profile — auth required
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () =>
      import('@org/account').then((m) => m.AccountComponent),
  },

  // Salon owner / franchise dashboard — role-gated
  {
    path: 'salon-dashboard',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['salon_owner', 'franchise_owner', 'admin'] },
    loadChildren: () =>
      import('@org/salon-dashboard').then((m) => m.DASHBOARD_ROUTES),
  },

  // Admin panel — admin role only
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
    loadChildren: () =>
      import('@org/admin').then((m) => m.ADMIN_ROUTES),
  },

  // Reviews — public read
  {
    path: 'reviews',
    loadComponent: () =>
      import('@org/reviews').then((m) => m.Reviews),
  },

  // Wildcard fallback
  { path: '**', redirectTo: '/discover' },
];

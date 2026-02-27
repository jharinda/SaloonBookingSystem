import { Routes } from '@angular/router';
import { DashboardHomeComponent } from './dashboard-home/dashboard-home.component';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardHomeComponent,
    children: [
      { path: '', redirectTo: 'bookings', pathMatch: 'full' },
      {
        path: 'register',
        loadComponent: () =>
          import('./register-salon/register-salon.component').then(
            (m) => m.RegisterSalonComponent,
          ),
      },
      {
        path: 'bookings',
        loadComponent: () =>
          import('./bookings-today/bookings-today.component').then(
            (m) => m.BookingsTodayComponent,
          ),
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./manage-services/manage-services.component').then(
            (m) => m.ManageServicesComponent,
          ),
      },
      {
        path: 'hours',
        loadComponent: () =>
          import('./manage-hours/manage-hours.component').then(
            (m) => m.ManageHoursComponent,
          ),
      },
      {
        path: 'reviews',
        loadComponent: () =>
          import('./salon-reviews/salon-reviews.component').then(
            (m) => m.SalonReviewsComponent,
          ),
      },
    ],
  },
];

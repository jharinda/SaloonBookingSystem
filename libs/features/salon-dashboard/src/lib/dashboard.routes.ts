import { Routes } from '@angular/router';
import { DashboardHomeComponent } from './dashboard-home/dashboard-home.component';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardHomeComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./dashboard-overview/dashboard-overview.component').then(
            (m) => m.DashboardOverviewComponent,
          ),
      },
      {
        path: 'franchise',
        loadComponent: () =>
          import('./franchise/franchise-overview.component').then(
            (m) => m.FranchiseOverviewComponent,
          ),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./register-salon/register-salon.component').then(
            (m) => m.RegisterSalonComponent,
          ),
      },
      {
        path: 'appointments',
        loadComponent: () =>
          import('./appointments/appointments.component').then(
            (m) => m.AppointmentsComponent,
          ),
      },
      // Legacy URL: "Appointments" in the UI lives on /appointments (day grid + manual booking).
      {
        path: 'bookings',
        redirectTo: 'appointments',
        pathMatch: 'full',
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./manage-services/manage-services.component').then(
            (m) => m.ManageServicesComponent,
          ),
      },
      {
        path: 'staff',
        loadComponent: () =>
          import('./manage-staff/manage-staff.component').then(
            (m) => m.ManageStaffComponent,
          ),
      },
      {
        path: 'stations',
        loadComponent: () =>
          import('./stations/stations.component').then(
            (m) => m.StationsComponent,
          ),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./analytics/analytics.component').then(
            (m) => m.AnalyticsComponent,
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
      {
        path: 'settings',
        loadComponent: () =>
          import('./salon-settings/salon-settings.component').then(
            (m) => m.SalonSettingsComponent,
          ),
      },
      {
        path: 'subscription',
        loadComponent: () =>
          import('./subscription/subscription.component').then(
            (m) => m.SubscriptionComponent,
          ),
      },
    ],
  },
];


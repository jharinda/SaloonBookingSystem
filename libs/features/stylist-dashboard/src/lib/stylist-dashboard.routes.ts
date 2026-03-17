import { Routes } from '@angular/router';
import { StylistDashboardHomeComponent } from './stylist-dashboard-home/stylist-dashboard-home.component';

export const STYLIST_DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: StylistDashboardHomeComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./stylist-overview/stylist-overview.component').then(
            (m) => m.StylistOverviewComponent,
          ),
      },
      {
        path: 'invitations',
        loadComponent: () =>
          import('./stylist-invitations/stylist-invitations.component').then(
            (m) => m.StylistInvitationsComponent,
          ),
      },
      {
        path: 'appointments',
        loadComponent: () =>
          import('./stylist-appointments/stylist-appointments.component').then(
            (m) => m.StylistAppointmentsComponent,
          ),
      },
      {
        path: 'details',
        loadComponent: () =>
          import('./stylist-details/stylist-details.component').then(
            (m) => m.StylistDetailsComponent,
          ),
      },
    ],
  },
];

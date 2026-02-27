import { Routes } from '@angular/router';

import { BookingSuccessComponent } from './booking-success/booking-success.component';
import { BookingWizardComponent } from './booking-wizard/booking-wizard.component';

/**
 * Mount these routes under a parent path, e.g.
 *
 *   { path: 'booking', loadChildren: () => import('@org/booking').then(m => m.BOOKING_ROUTES) }
 *
 * Resulting URLs:
 *   /booking/success/:bookingId  →  BookingSuccessComponent
 *   /booking/:salonId            →  BookingWizardComponent
 *
 * NOTE: 'success/:bookingId' MUST be declared before ':salonId' so Angular
 * Router matches the literal segment 'success' first.
 */
export const BOOKING_ROUTES: Routes = [
  {
    path: 'success/:bookingId',
    component: BookingSuccessComponent,
  },
  {
    path: ':salonId',
    component: BookingWizardComponent,
  },
];

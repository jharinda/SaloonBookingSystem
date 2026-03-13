import { Routes } from '@angular/router';

import { BookingSuccessComponent } from './booking-success/booking-success.component';
import { BookingWizardComponent } from './booking-wizard/booking-wizard.component';

/**
 * Mount these routes under a parent path, e.g.
 *
 *   { path: 'booking', loadChildren: () => import('@org/booking').then(m => m.BOOKING_ROUTES) }
 *
 * Resulting URLs:
 *   /booking/success/:bookingId  →  BookingSuccessComponent (post-booking confirmation)
 *   /booking/view/:bookingId     →  BookingSuccessComponent (view existing booking)
 *   /booking/:salonId            →  BookingWizardComponent  (create new booking)
 *
 * NOTE: Specific literal segments ('success', 'view') MUST be declared before
 * the wildcard ':salonId' pattern so Angular Router matches them first.
 */
export const BOOKING_ROUTES: Routes = [
  {
    path: 'success/:bookingId',
    component: BookingSuccessComponent,
  },
  {
    path: 'view/:bookingId',
    component: BookingSuccessComponent,
  },
  {
    path: ':salonId',
    component: BookingWizardComponent,
  },
];

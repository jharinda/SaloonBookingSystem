import { Routes } from '@angular/router';
import { SubmitReviewComponent } from './reviews/reviews';

export const REVIEWS_ROUTES: Routes = [
  { path: 'new', component: SubmitReviewComponent },
  { path: '', redirectTo: 'new', pathMatch: 'full' },
];

import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('@org/auth').then((m) => m.Auth),
  },
  {
    path: 'register',
    loadComponent: () => import('@org/auth').then((m) => m.Auth),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];

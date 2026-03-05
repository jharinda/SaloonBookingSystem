import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./google-callback/google-callback.component').then(
        (m) => m.GoogleCallbackComponent,
      ),
  },
  {
    path: 'google/complete',
    loadComponent: () =>
      import('./google-complete/google-complete.component').then(
        (m) => m.GoogleCompleteComponent,
      ),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];

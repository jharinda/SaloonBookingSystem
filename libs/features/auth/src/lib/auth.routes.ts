import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./auth-redirect.component').then((m) => m.AuthRedirectComponent),
  },
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
    path: 'forgot-password',
    loadComponent: () =>
      import('./forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
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
];

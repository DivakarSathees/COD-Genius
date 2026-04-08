import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './services/auth.service';

// Domains that require the COD Genius JWT — add more if the backend URL ever changes
const PROTECTED_DOMAINS = ['localhost:3000', 'cod-genius-backend.onrender.com'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  const needsAuth = PROTECTED_DOMAINS.some(d => req.url.includes(d));
  if (token && needsAuth) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};

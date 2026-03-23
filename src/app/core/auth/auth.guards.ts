import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { UserRole } from '../models/commerce.models';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.ensureInitialized();

  return authService.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.ensureInitialized();

  if (!authService.isAuthenticated()) {
    return true;
  }

  const profile = await authService.ensureProfileLoaded();
  return router.createUrlTree([profile?.role === 'seller' ? '/seller' : '/buyer']);
};

export const roleGuard = (role: UserRole): CanActivateFn => {
  return async (): Promise<boolean | UrlTree> => {
    const authService = inject(AuthService);
    const router = inject(Router);

    await authService.ensureInitialized();

    if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    const profile = await authService.ensureProfileLoaded();
    if (profile?.role === role) {
      return true;
    }

    return router.createUrlTree([profile?.role === 'seller' ? '/seller' : '/buyer']);
  };
};
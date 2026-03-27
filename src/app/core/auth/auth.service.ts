import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Auth,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from '@angular/fire/auth';
import { Database, get, off, onValue, ref, set } from '@angular/fire/database';

import { UserProfile, UserRole } from '../models/commerce.models';
import { removeUndefinedDeep } from '../data/firebase-data.util';

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  businessName?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly database = inject(Database);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUserSignal = signal<User | null>(null);
  private readonly profileSignal = signal<UserProfile | null>(null);
  private readonly authReadySignal = signal(false);
  private readonly busySignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  private profilePath?: string;
  private resolveInitialized!: () => void;
  private readonly initialized = new Promise<void>((resolve) => {
    this.resolveInitialized = resolve;
  });

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly profile = this.profileSignal.asReadonly();
  readonly authReady = this.authReadySignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  readonly errorMessage = this.errorSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);
  readonly role = computed(() => this.profileSignal()?.role ?? null);

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.currentUserSignal.set(user);
      this.authReadySignal.set(true);
      this.bindProfile(user);
      this.resolveInitialized();
    });

    this.destroyRef.onDestroy(() => {
      if (this.profilePath) {
        off(ref(this.database, this.profilePath));
      }
    });
  }

  async ensureInitialized(): Promise<void> {
    await this.initialized;
  }

  async ensureProfileLoaded(): Promise<UserProfile | null> {
    await this.ensureInitialized();
    const user = this.currentUserSignal();

    if (!user) {
      return null;
    }

    const existingProfile = this.profileSignal();
    if (existingProfile) {
      return existingProfile;
    }

    const snapshot = await get(ref(this.database, `users/${user.uid}`));
    const profile = snapshot.exists() ? (snapshot.val() as UserProfile) : null;
    this.profileSignal.set(profile);
    return profile;
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  async register(payload: RegisterPayload): Promise<void> {
    this.busySignal.set(true);
    this.errorSignal.set(null);

    try {
      const credential = await createUserWithEmailAndPassword(this.auth, payload.email, payload.password);
      const profile: UserProfile = {
        uid: credential.user.uid,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        phone: payload.phone,
        businessName: payload.businessName,
        createdAt: new Date().toISOString()
      };

      await set(ref(this.database, `users/${credential.user.uid}`), removeUndefinedDeep(profile));
      this.profileSignal.set(profile);
      await this.router.navigateByUrl(payload.role === 'seller' ? '/seller' : '/buyer');
    } catch (error) {
      this.errorSignal.set(this.mapAuthError(error));
      throw error;
    } finally {
      this.busySignal.set(false);
    }
  }

  async login(email: string, password: string): Promise<void> {
    this.busySignal.set(true);
    this.errorSignal.set(null);

    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, password);
      const snapshot = await get(ref(this.database, `users/${credential.user.uid}`));
      const profile = snapshot.exists() ? (snapshot.val() as UserProfile) : null;

      if (!profile) {
        throw new Error('profile-missing');
      }

      this.profileSignal.set(profile);
      await this.router.navigateByUrl(profile.role === 'seller' ? '/seller' : '/buyer');
    } catch (error) {
      this.errorSignal.set(this.mapAuthError(error));
      throw error;
    } finally {
      this.busySignal.set(false);
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.profileSignal.set(null);
    this.errorSignal.set(null);
    await this.router.navigateByUrl('/');
  }

  async updateProfile(payload: { name: string; phone?: string; businessName?: string }): Promise<void> {
    const user = this.currentUserSignal();
    const profile = this.profileSignal();

    if (!user || !profile) {
      throw new Error('You must be signed in to update your account.');
    }

    const nextProfile: UserProfile = {
      ...profile,
      name: payload.name,
      phone: payload.phone,
      businessName: payload.businessName
    };

    await set(ref(this.database, `users/${user.uid}`), removeUndefinedDeep(nextProfile));
    this.profileSignal.set(nextProfile);
  }

  private bindProfile(user: User | null): void {
    if (this.profilePath) {
      off(ref(this.database, this.profilePath));
      this.profilePath = undefined;
    }

    if (!user) {
      this.profileSignal.set(null);
      return;
    }

    this.profilePath = `users/${user.uid}`;
    onValue(ref(this.database, this.profilePath), (snapshot) => {
      this.profileSignal.set(snapshot.exists() ? (snapshot.val() as UserProfile) : null);
    });
  }

  private mapAuthError(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      switch ((error as { code: string }).code) {
        case 'auth/email-already-in-use':
          return 'That email is already in use.';
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          return 'Email or password is incorrect.';
        default:
          break;
      }
    }

    if (error instanceof Error && error.message === 'profile-missing') {
      return 'Your account exists, but the business profile is missing in Realtime Database.';
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Authentication failed. Please try again.';
  }
}
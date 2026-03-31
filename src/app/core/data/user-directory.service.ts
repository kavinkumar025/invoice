import { Injectable, computed, inject, signal } from '@angular/core';
import { Database, onValue, ref } from '@angular/fire/database';

import { UserProfile } from '../models/commerce.models';

@Injectable({ providedIn: 'root' })
export class UserDirectoryService {
  private readonly database = inject(Database);
  private readonly profilesSignal = signal<UserProfile[]>([]);
  private readonly loadingSignal = signal(true);

  readonly profiles = this.profilesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly sellers = computed(() => this.profilesSignal().filter((profile) => profile.role === 'seller'));
  readonly buyers = computed(() => this.profilesSignal().filter((profile) => profile.role === 'buyer'));
  readonly profileMap = computed(() => new Map(this.profilesSignal().map((profile) => [profile.uid, profile])));

  constructor() {
    onValue(ref(this.database, 'users'), (snapshot) => {
      if (!snapshot.exists()) {
        this.profilesSignal.set([]);
        this.loadingSignal.set(false);
        return;
      }

      const value = snapshot.val() as Record<string, UserProfile>;
      const profiles = Object.entries(value)
        .map(([uid, profile]) => ({ ...profile, uid }))
        .sort((left, right) => left.name.localeCompare(right.name));

      this.profilesSignal.set(profiles);
      this.loadingSignal.set(false);
    });
  }
}
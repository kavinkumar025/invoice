import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Database, off, onValue, push, ref, remove, update } from '@angular/fire/database';

import { AuthService } from '../auth/auth.service';
import { GeocodingService } from '../location/geocoding.service';
import { Address, AddressDraft } from '../models/commerce.models';
import { removeUndefinedDeep } from './firebase-data.util';

@Injectable({ providedIn: 'root' })
export class AddressService {
  private readonly database = inject(Database);
  private readonly authService = inject(AuthService);
  private readonly geocodingService = inject(GeocodingService);
  private readonly addressesSignal = signal<Address[]>([]);
  private readonly loadingSignal = signal(false);

  readonly addresses = this.addressesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly defaultAddress = computed(() => this.addressesSignal().find((address) => address.isDefault) ?? this.addressesSignal()[0] ?? null);

  constructor() {
    effect((onCleanup) => {
      const userId = this.authService.currentUser()?.uid;

      if (!userId) {
        this.addressesSignal.set([]);
        this.loadingSignal.set(false);
        return;
      }

      const addressesRef = ref(this.database, `addresses/${userId}`);
      this.loadingSignal.set(true);

      onValue(addressesRef, (snapshot) => {
        if (!snapshot.exists()) {
          this.addressesSignal.set([]);
          this.loadingSignal.set(false);
          return;
        }

        const value = snapshot.val() as Record<string, Address>;
        const addresses = Object.entries(value).map(([id, address]) => ({ ...address, id }));
        addresses.sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
        this.addressesSignal.set(addresses);
        this.loadingSignal.set(false);
      });

      onCleanup(() => off(addressesRef));
    });
  }

  async saveAddress(draft: AddressDraft): Promise<string> {
    const userId = this.authService.currentUser()?.uid;

    if (!userId) {
      throw new Error('Only authenticated buyers can manage addresses.');
    }

    const addressId = draft.id ?? push(ref(this.database, `addresses/${userId}`)).key;
    if (!addressId) {
      throw new Error('Could not generate an address id.');
    }

    const resolvedAddress = await this.geocodingService.geocodeAddress(draft).catch(() => null);

    const hasDefault = this.addressesSignal().some((address) => address.isDefault);
    const shouldBeDefault = draft.isDefault ?? !hasDefault;
    const updates: Record<string, Address | boolean | string> = {
      [`addresses/${userId}/${addressId}`]: {
        id: addressId,
        label: draft.label,
        contactName: draft.contactName,
        phone: draft.phone,
        line1: draft.line1,
        line2: draft.line2,
        city: draft.city,
        state: draft.state,
        postalCode: draft.postalCode,
        coordinates: resolvedAddress?.coordinates ?? draft.coordinates,
        isDefault: shouldBeDefault
      },
      [`users/${userId}/defaultAddressId`]: addressId
    };

    if (shouldBeDefault) {
      for (const address of this.addressesSignal()) {
        if (address.id !== addressId && address.isDefault) {
          updates[`addresses/${userId}/${address.id}/isDefault`] = false;
        }
      }
    }

    await update(ref(this.database), removeUndefinedDeep(updates));
    return addressId;
  }

  async setDefaultAddress(addressId: string): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) {
      throw new Error('Only authenticated buyers can manage addresses.');
    }

    const updates: Record<string, boolean | string> = {
      [`users/${userId}/defaultAddressId`]: addressId
    };

    for (const address of this.addressesSignal()) {
      updates[`addresses/${userId}/${address.id}/isDefault`] = address.id === addressId;
    }

    await update(ref(this.database), removeUndefinedDeep(updates));
  }

  async deleteAddress(addressId: string): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) {
      throw new Error('Only authenticated buyers can manage addresses.');
    }

    const deletingDefault = this.addressesSignal().find((address) => address.id === addressId)?.isDefault ?? false;
    await remove(ref(this.database, `addresses/${userId}/${addressId}`));

    if (deletingDefault) {
      const fallback = this.addressesSignal().find((address) => address.id !== addressId);
      if (fallback) {
        await this.setDefaultAddress(fallback.id);
      }
    }
  }
}
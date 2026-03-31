import { Injectable } from '@angular/core';

import { Address, AddressDraft, GeoCoordinates } from '../models/commerce.models';

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

export interface GeocodedAddressResult {
  label?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  coordinates: GeoCoordinates;
}

const ADDRESS_GEOCODE_CACHE_KEY = 'invoicehub-address-geocode-cache';

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly cache = new Map<string, GeocodedAddressResult | null>(this.readCache());

  async geocodeAddress(address: Pick<Address | AddressDraft, 'line1' | 'line2' | 'city' | 'state' | 'postalCode'>): Promise<GeocodedAddressResult | null> {
    const query = [address.line1, address.line2, address.city, address.state, address.postalCode, 'India']
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(', ');

    if (!query) {
      return null;
    }

    const cacheKey = query.toLowerCase();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Could not resolve the address location right now.');
    }

    const results = (await response.json()) as NominatimSearchResult[];
    const first = results[0] ?? null;
    const resolved = first
      ? {
          label: first.display_name,
          city: first.address?.city || first.address?.town || first.address?.village,
          state: first.address?.state,
          postalCode: this.normalizePostalCode(first.address?.postcode, first.address?.country),
          country: first.address?.country,
          coordinates: {
            latitude: Number(first.lat),
            longitude: Number(first.lon)
          }
        }
      : null;

    this.cache.set(cacheKey, resolved);
    this.persistCache();
    return resolved;
  }

  private normalizePostalCode(postalCode: string | undefined, country: string | undefined): string | undefined {
    if (!postalCode) {
      return undefined;
    }

    const trimmedPostalCode = postalCode.trim();
    const digitsOnly = trimmedPostalCode.replace(/\D/g, '');

    if (country === 'India' && digitsOnly.length >= 6) {
      return digitsOnly.slice(0, 6);
    }

    if (digitsOnly.length === 6) {
      return digitsOnly;
    }

    return trimmedPostalCode;
  }

  private persistCache(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const serialized = JSON.stringify(Object.fromEntries(this.cache.entries()));
    localStorage.setItem(ADDRESS_GEOCODE_CACHE_KEY, serialized);
  }

  private readCache(): Array<[string, GeocodedAddressResult | null]> {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    const stored = localStorage.getItem(ADDRESS_GEOCODE_CACHE_KEY);
    if (!stored) {
      return [];
    }

    try {
      return Object.entries(JSON.parse(stored) as Record<string, GeocodedAddressResult | null>);
    } catch {
      return [];
    }
  }
}
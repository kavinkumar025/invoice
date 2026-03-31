import { Injectable, inject, signal } from '@angular/core';
import { Database, ref, update } from '@angular/fire/database';

import { AuthService } from '../auth/auth.service';
import { SavedLocation } from '../models/commerce.models';
import { removeUndefinedDeep } from '../data/firebase-data.util';

type LocationPermissionState = PermissionState | 'unsupported' | 'idle' | 'manual';

interface ManualLocationInput {
  city?: string;
  state?: string;
  postalCode?: string;
}

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

interface NominatimReverseResult {
  display_name?: string;
  address?: NominatimAddress;
}

interface BigDataCloudResult {
  latitude: number;
  longitude: number;
  locality: string;
  city: string;
  principalSubdivision: string;
  countryName: string;
  postcode: string;
  localityInfo?: {
    administrative?: Array<{ name: string; order: number; adminLevel: number }>;
  };
}

interface IndiaPostResponse {
  Message: string;
  Status: string;
  PostOffice: Array<{ Name: string; District: string; State: string; Pincode: string }> | null;
}

const REVERSE_GEOCODE_ZOOMS = [18, 16, 14] as const;

const LOCATION_STORAGE_KEY = 'invoicehub-current-location';

@Injectable({ providedIn: 'root' })
export class LocationDiscoveryService {
  private readonly authService = inject(AuthService);
  private readonly database = inject(Database);
  private readonly currentLocationSignal = signal<SavedLocation | null>(this.readStoredLocation());
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly permissionSignal = signal<LocationPermissionState>(this.readStoredLocation()?.source === 'manual' ? 'manual' : 'idle');
  private readonly requestedOnLoadSignal = signal(false);

  readonly currentLocation = this.currentLocationSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly errorMessage = this.errorSignal.asReadonly();
  readonly permissionState = this.permissionSignal.asReadonly();

  async findPostalCodeFromCoordinates(latitude: number, longitude: number): Promise<string | null> {
    // Try BigDataCloud first
    const bigData = await this.reverseGeocodeViaBigDataCloud(latitude, longitude).catch(() => null);
    if (bigData?.postcode) {
      const validated = await this.validateIndianPincode(bigData.postcode, bigData.city || bigData.locality);
      return validated ?? bigData.postcode;
    }

    // Fallback to Nominatim
    const reverse = await this.resolveBestReverseGeocode(latitude, longitude);
    return this.normalizePostalCode(reverse?.address?.postcode, reverse?.address?.country) ?? null;
  }

  async ensureLocationRequestedOnLoad(): Promise<void> {
    if (this.requestedOnLoadSignal()) {
      return;
    }

    this.requestedOnLoadSignal.set(true);
    await this.syncPermissionState();

    const existingLocation = this.currentLocationSignal();
    if (existingLocation?.source === 'browser' && existingLocation.coordinates) {
      const ageMs = Date.now() - new Date(existingLocation.updatedAt).getTime();
      if (ageMs > 10 * 60 * 1000 || this.shouldRefreshPostalCode(existingLocation)) {
        await this.requestBrowserLocation();
        return;
      }
    } else if (existingLocation?.coordinates && this.shouldRefreshPostalCode(existingLocation)) {
      await this.refreshStoredLocation(existingLocation);
      return;
    }

    const permission = this.permissionSignal();
    if (permission === 'unsupported' || permission === 'denied' || this.currentLocationSignal()) {
      return;
    }

    await this.requestBrowserLocation();
  }

  async requestBrowserLocation(): Promise<SavedLocation | null> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.permissionSignal.set('unsupported');
      this.errorSignal.set('Browser geolocation is not available on this device. Enter city or PIN code manually.');
      return null;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        });
      });

      const location = await this.buildLocationFromCoordinates(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
        'browser'
      );

      this.setCurrentLocation(location);
      this.permissionSignal.set('granted');
      await this.persistLocationToProfile(location);
      return location;
    } catch (error) {
      this.permissionSignal.set(this.resolvePermissionState(error));
      this.errorSignal.set(this.describeLocationError(error));
      return null;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async applyManualLocation(input: ManualLocationInput): Promise<SavedLocation | null> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const location = await this.resolveManualLocation(input);
      this.setCurrentLocation(location);
      this.permissionSignal.set('manual');
      await this.persistLocationToProfile(location);
      return location;
    } catch (error) {
      this.errorSignal.set(error instanceof Error ? error.message : 'Could not resolve that city or PIN code.');
      return null;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async resolveManualLocation(input: ManualLocationInput): Promise<SavedLocation> {
    const query = [input.postalCode?.trim(), input.city?.trim(), input.state?.trim(), 'India'].filter(Boolean).join(', ');

    if (!query) {
      throw new Error('Enter a city or PIN code to continue.');
    }

    // If user entered a 6-digit pincode, validate via India Post first
    const inputPin = input.postalCode?.trim().replace(/\D/g, '');
    if (inputPin && inputPin.length === 6) {
      try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(inputPin)}`, {
          headers: { Accept: 'application/json' }
        });
        if (response.ok) {
          const data = (await response.json()) as IndiaPostResponse[];
          const result = data[0];
          if (result?.Status === 'Success' && result.PostOffice?.length) {
            const po = result.PostOffice[0];
            // Still geocode for coordinates but use India Post data for city/state/pincode
            const geoResponse = await fetch(
              `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(`${inputPin}, India`)}`,
              { headers: { Accept: 'application/json' } }
            );
            let coords = { latitude: 0, longitude: 0 };
            if (geoResponse.ok) {
              const geoResults = (await geoResponse.json()) as NominatimSearchResult[];
              if (geoResults[0]) {
                coords = { latitude: Number(geoResults[0].lat), longitude: Number(geoResults[0].lon) };
              }
            }
            return {
              label: `${po.Name}, ${po.District}, ${po.State}`,
              city: po.District,
              state: po.State,
              postalCode: po.Pincode,
              country: 'India',
              coordinates: coords,
              source: 'manual',
              updatedAt: new Date().toISOString()
            };
          }
        }
      } catch {
        // Fall through to Nominatim
      }
    }

    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Could not reach the geocoding service. Try again in a moment.');
    }

    const results = (await response.json()) as NominatimSearchResult[];
    const first = results[0];

    if (!first) {
      throw new Error('No matching location was found for that city or PIN code.');
    }

    return {
      label: first.display_name,
      city: first.address?.city || first.address?.town || first.address?.village || input.city?.trim(),
      state: first.address?.state || input.state?.trim(),
      postalCode: first.address?.postcode || input.postalCode?.trim(),
      country: first.address?.country,
      coordinates: {
        latitude: Number(first.lat),
        longitude: Number(first.lon)
      },
      source: 'manual',
      updatedAt: new Date().toISOString()
    };
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  private async syncPermissionState(): Promise<void> {
    if (typeof navigator === 'undefined') {
      return;
    }

    if (!('geolocation' in navigator)) {
      this.permissionSignal.set('unsupported');
      return;
    }

    if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        this.permissionSignal.set(status.state);
        status.onchange = () => {
          this.permissionSignal.set(status.state);
        };
        return;
      } catch {
        // Fallback to existing stored state when the Permissions API is unavailable.
      }
    }

    if (!this.currentLocationSignal()) {
      this.permissionSignal.set('prompt');
    }
  }

  private async buildLocationFromCoordinates(
    latitude: number,
    longitude: number,
    accuracy: number | undefined,
    source: SavedLocation['source']
  ): Promise<SavedLocation> {
    // Try BigDataCloud first (free, no key, reliable for India)
    const bigData = await this.reverseGeocodeViaBigDataCloud(latitude, longitude).catch(() => null);

    if (bigData?.postcode) {
      const validated = await this.validateIndianPincode(bigData.postcode, bigData.city || bigData.locality);
      const postalCode = validated ?? bigData.postcode;

      return {
        label: [bigData.locality || bigData.city, bigData.principalSubdivision, bigData.countryName].filter(Boolean).join(', '),
        city: bigData.city || bigData.locality,
        state: bigData.principalSubdivision,
        postalCode,
        country: bigData.countryName,
        coordinates: { latitude, longitude, accuracy },
        source,
        updatedAt: new Date().toISOString()
      };
    }

    // Fallback to Nominatim
    const reverse = await this.resolveBestReverseGeocode(latitude, longitude);
    const nominatimPostalCode = this.normalizePostalCode(reverse?.address?.postcode, reverse?.address?.country);
    const city = reverse?.address?.city || reverse?.address?.town || reverse?.address?.village;

    // Cross-validate Nominatim postal code via India Post
    let postalCode = nominatimPostalCode;
    if (postalCode && city) {
      const validated = await this.validateIndianPincode(postalCode, city);
      if (validated) {
        postalCode = validated;
      }
    }

    return {
      label: reverse?.display_name || this.fallbackLabel(latitude, longitude),
      city,
      state: reverse?.address?.state,
      postalCode,
      country: reverse?.address?.country,
      coordinates: { latitude, longitude, accuracy },
      source,
      updatedAt: new Date().toISOString()
    };
  }

  private async resolveBestReverseGeocode(latitude: number, longitude: number): Promise<NominatimReverseResult | null> {
    let fallbackResult: NominatimReverseResult | null = null;

    for (const zoom of REVERSE_GEOCODE_ZOOMS) {
      const result = await this.reverseGeocode(latitude, longitude, zoom).catch(() => null);
      if (!result) {
        continue;
      }

      fallbackResult ??= result;

      const postalCode = this.normalizePostalCode(result.address?.postcode, result.address?.country);
      if (postalCode) {
        return {
          ...result,
          address: {
            ...result.address,
            postcode: postalCode
          }
        };
      }
    }

    return fallbackResult;
  }

  private async reverseGeocode(latitude: number, longitude: number, zoom: number): Promise<NominatimReverseResult> {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=${zoom}&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`,
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Reverse geocoding failed.');
    }

    return (await response.json()) as NominatimReverseResult;
  }

  private setCurrentLocation(location: SavedLocation): void {
    this.currentLocationSignal.set(location);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
    }
  }

  private readStoredLocation(): SavedLocation | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const stored = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as SavedLocation;
    } catch {
      return null;
    }
  }

  private async persistLocationToProfile(location: SavedLocation): Promise<void> {
    const user = this.authService.currentUser();

    if (!user) {
      return;
    }

    await update(ref(this.database, `users/${user.uid}`), removeUndefinedDeep({ location }));
  }

  private fallbackLabel(latitude: number, longitude: number): string {
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  }

  private async refreshStoredLocation(location: SavedLocation): Promise<void> {
    this.loadingSignal.set(true);

    try {
      const refreshedLocation = await this.buildLocationFromCoordinates(
        location.coordinates.latitude,
        location.coordinates.longitude,
        location.coordinates.accuracy,
        location.source
      );

      const nextLocation: SavedLocation = {
        ...location,
        ...refreshedLocation,
        source: location.source,
        updatedAt: new Date().toISOString()
      };

      this.setCurrentLocation(nextLocation);
      await this.persistLocationToProfile(nextLocation);
    } finally {
      this.loadingSignal.set(false);
    }
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

  private shouldRefreshPostalCode(location: SavedLocation): boolean {
    const normalizedPostalCode = this.normalizePostalCode(location.postalCode, location.country);
    return !normalizedPostalCode || normalizedPostalCode !== location.postalCode;
  }

  private async reverseGeocodeViaBigDataCloud(latitude: number, longitude: number): Promise<BigDataCloudResult> {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&localityLanguage=en`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error('BigDataCloud reverse geocoding failed.');
    }

    return (await response.json()) as BigDataCloudResult;
  }

  /**
   * Validates an Indian pincode against the India Post API.
   * Returns the validated pincode if the city matches, or the correct pincode for that
   * district if found, or null if validation cannot be performed.
   */
  private async validateIndianPincode(pincode: string, city: string): Promise<string | null> {
    if (!pincode || !city) {
      return null;
    }

    const digitsOnly = pincode.replace(/\D/g, '');
    if (digitsOnly.length !== 6) {
      return null;
    }

    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(digitsOnly)}`, {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as IndiaPostResponse[];
      const result = data[0];
      if (result?.Status !== 'Success' || !result.PostOffice?.length) {
        return null;
      }

      const cityLower = city.toLowerCase();
      const matchesCity = result.PostOffice.some(
        (po) =>
          po.District.toLowerCase().includes(cityLower) ||
          cityLower.includes(po.District.toLowerCase()) ||
          po.Name.toLowerCase().includes(cityLower)
      );

      if (matchesCity) {
        return digitsOnly;
      }

      // Pincode doesn't match city — try looking up correct pincode by city name
      const cityResponse = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(city)}`, {
        headers: { Accept: 'application/json' }
      });

      if (!cityResponse.ok) {
        return digitsOnly; // Return original if city lookup fails
      }

      const cityData = (await cityResponse.json()) as IndiaPostResponse[];
      const cityResult = cityData[0];
      if (cityResult?.Status === 'Success' && cityResult.PostOffice?.length) {
        return cityResult.PostOffice[0].Pincode;
      }

      return digitsOnly;
    } catch {
      return null; // Network error — skip validation
    }
  }

  private resolvePermissionState(error: unknown): LocationPermissionState {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      return (error as GeolocationPositionError).code === 1 ? 'denied' : 'prompt';
    }

    return 'prompt';
  }

  private describeLocationError(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      switch ((error as GeolocationPositionError).code) {
        case 1:
          return 'Location access was denied. Enter city or PIN code manually to continue.';
        case 2:
          return 'Your location could not be determined. Check device location services and retry.';
        case 3:
          return 'Location request timed out. Try again or enter city or PIN code manually.';
        default:
          break;
      }
    }

    return error instanceof Error ? error.message : 'Could not determine your location.';
  }
}
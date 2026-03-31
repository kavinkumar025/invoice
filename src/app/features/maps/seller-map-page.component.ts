import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import * as L from 'leaflet';

import { UserDirectoryService } from '../../core/data/user-directory.service';
import { GeocodingService } from '../../core/location/geocoding.service';
import { LocationDiscoveryService } from '../../core/location/location-discovery.service';
import { UserProfile, GeoCoordinates } from '../../core/models/commerce.models';

interface SellerMapPin {
  seller: UserProfile;
  coordinates: GeoCoordinates;
  geocoded: boolean;
}

@Component({
  selector: 'app-seller-map-page',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section seller-map-layout">
      <header class="surface-card map-hero">
        <div>
          <span class="eyebrow">Discover</span>
          <h1 class="section-title">Seller shops near you</h1>
          <p class="muted">Find verified sellers on the map. Tap a pin to view shop details and start purchasing.</p>
        </div>
      </header>

      @if (directoryService.loading()) {
        <div class="surface-card map-loading">
          <p>Loading seller locations&hellip;</p>
        </div>
      } @else if (pins().length === 0 && !resolving()) {
        <div class="surface-card map-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <h3>No seller locations available</h3>
          <p class="muted">Sellers haven't shared their locations yet. Check back soon!</p>
        </div>
      } @else {
        @if (resolving()) {
          <div class="map-resolving-banner">Resolving {{ pendingCount() }} seller location{{ pendingCount() === 1 ? '' : 's' }}&hellip;</div>
        }
        <div class="map-container-wrapper">
          <div id="seller-map" class="seller-map-container"></div>
        </div>

        <div class="surface-card map-seller-list">
          <h3 class="list-heading">{{ pins().length }} seller{{ pins().length === 1 ? '' : 's' }} on the map</h3>
          <ul class="seller-list">
            @for (pin of pins(); track pin.seller.uid) {
              <li class="seller-list-item" (click)="panToSeller(pin)">
                <div class="seller-avatar">{{ initials(pin.seller.businessName || pin.seller.name) }}</div>
                <div class="seller-list-info">
                  <strong>{{ pin.seller.businessName || pin.seller.name }}</strong>
                  <span class="muted">{{ pin.seller.location?.city || 'Unknown city' }}, {{ pin.seller.location?.state || '' }}</span>
                  @if (pin.seller.phone) {
                    <small class="muted">{{ pin.seller.phone }}</small>
                  }
                </div>
                <svg class="list-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </li>
            }
          </ul>
        </div>
      }
    </section>
  `,
  styles: [`
    .seller-map-layout { display: flex; flex-direction: column; gap: 1rem; }
    .map-hero { padding: 1.5rem 2rem; }
    .map-hero .eyebrow { display: block; font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--brand); margin-bottom: .25rem; }
    .map-hero .section-title { margin: 0 0 .35rem; }
    .map-hero .muted { margin: 0; }

    .map-loading, .map-empty { padding: 3rem 2rem; text-align: center; }
    .map-empty svg { margin-bottom: 1rem; }
    .map-empty h3 { margin: 0 0 .5rem; }

    .map-resolving-banner { background: var(--brand-light); color: var(--brand-dark); font-size: .8rem; font-weight: 500; text-align: center; padding: .45rem .75rem; border-radius: .5rem; }

    .map-container-wrapper { border-radius: .75rem; overflow: hidden; border: 1px solid var(--line); box-shadow: var(--shadow-sm); }
    .seller-map-container { width: 100%; height: 420px; }

    .map-seller-list { padding: 1.25rem 1.5rem; }
    .list-heading { margin: 0 0 .75rem; font-size: .95rem; }
    .seller-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
    .seller-list-item {
      display: flex; align-items: center; gap: .75rem; padding: .65rem .75rem;
      border: 1px solid var(--line); border-radius: .5rem; cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    .seller-list-item:hover { background: var(--surface-2); border-color: var(--brand); }
    .seller-avatar {
      width: 36px; height: 36px; border-radius: 50%; background: var(--brand-light); color: var(--brand-dark);
      display: flex; align-items: center; justify-content: center; font-size: .75rem; font-weight: 700; flex-shrink: 0;
    }
    .seller-list-info { flex: 1; min-width: 0; }
    .seller-list-info strong { display: block; font-size: .85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .seller-list-info span, .seller-list-info small { display: block; font-size: .75rem; }
    .list-chevron { flex-shrink: 0; color: var(--text-secondary); }

    @media (max-width: 600px) {
      .map-hero { padding: 1rem 1.25rem; }
      .seller-map-container { height: 300px; }
      .map-seller-list { padding: 1rem; }
    }
  `]
})
export class SellerMapPageComponent implements OnInit, OnDestroy {
  readonly directoryService = inject(UserDirectoryService);
  private readonly geocodingService = inject(GeocodingService);
  private readonly locationService = inject(LocationDiscoveryService);

  private map: L.Map | null = null;
  private markerLayer: L.LayerGroup | null = null;

  readonly pinsSignal = signal<SellerMapPin[]>([]);
  readonly resolvingSignal = signal(false);
  readonly pendingCountSignal = signal(0);

  readonly pins = this.pinsSignal.asReadonly();
  readonly resolving = this.resolvingSignal.asReadonly();
  readonly pendingCount = this.pendingCountSignal.asReadonly();

  readonly sellersWithLocation = computed(() =>
    this.directoryService.sellers().filter((s) => s.location?.coordinates)
  );

  readonly sellersWithoutLocation = computed(() =>
    this.directoryService.sellers().filter((s) => !s.location?.coordinates)
  );

  ngOnInit(): void {
    this.waitForSellers();
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  panToSeller(pin: SellerMapPin): void {
    if (!this.map) return;
    this.map.setView([pin.coordinates.latitude, pin.coordinates.longitude], 15, { animate: true });
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  private async waitForSellers(): Promise<void> {
    // If directory hasn't loaded yet, poll briefly
    if (this.directoryService.loading()) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this.directoryService.loading()) {
            clearInterval(check);
            resolve();
          }
        }, 200);
      });
    }
    await this.resolvePins();
  }

  private async resolvePins(): Promise<void> {
    const readyPins: SellerMapPin[] = this.sellersWithLocation().map((seller) => ({
      seller,
      coordinates: seller.location!.coordinates,
      geocoded: false
    }));

    this.pinsSignal.set(readyPins);

    // Immediately render the map with available pins
    if (readyPins.length > 0) {
      this.renderMap();
    }

    // Geocode sellers that are missing location coordinates
    const missing = this.sellersWithoutLocation();
    if (missing.length > 0) {
      this.resolvingSignal.set(true);
      this.pendingCountSignal.set(missing.length);

      for (const seller of missing) {
        const coords = await this.geocodeSellerFallback(seller);
        if (coords) {
          readyPins.push({ seller, coordinates: coords, geocoded: true });
          this.pinsSignal.set([...readyPins]);
          this.refreshMarkers();
        }
        this.pendingCountSignal.update((c) => c - 1);
      }

      this.resolvingSignal.set(false);
    }

    // Initialize map if it hadn't been rendered yet (if all sellers were geocoded)
    if (!this.map && readyPins.length > 0) {
      this.renderMap();
    }
  }

  private async geocodeSellerFallback(seller: UserProfile): Promise<GeoCoordinates | null> {
    // Try to geocode from location metadata
    if (seller.location?.city || seller.location?.postalCode) {
      const result = await this.geocodingService.geocodeAddress({
        line1: '',
        city: seller.location.city ?? '',
        state: seller.location.state ?? '',
        postalCode: seller.location.postalCode ?? ''
      }).catch(() => null);
      if (result) return result.coordinates;
    }

    // Try business name + any available location text
    if (seller.businessName) {
      const searchQuery = [seller.businessName, seller.location?.city, seller.location?.state, 'India']
        .filter(Boolean)
        .join(', ');
      const result = await this.geocodingService.geocodeAddress({
        line1: searchQuery,
        city: '',
        state: '',
        postalCode: ''
      }).catch(() => null);
      if (result) return result.coordinates;
    }

    return null;
  }

  private renderMap(): void {
    if (this.map) return;

    const container = document.getElementById('seller-map');
    if (!container) return;

    // Default center: India
    const defaultCenter: L.LatLngExpression = [20.5937, 78.9629];
    const defaultZoom = 5;
    const currentLocation = this.locationService.currentLocation();

    const center: L.LatLngExpression = currentLocation?.coordinates
      ? [currentLocation.coordinates.latitude, currentLocation.coordinates.longitude]
      : this.pinsSignal().length > 0
        ? [this.pinsSignal()[0].coordinates.latitude, this.pinsSignal()[0].coordinates.longitude]
        : defaultCenter;

    const zoom = currentLocation?.coordinates || this.pinsSignal().length > 0 ? 11 : defaultZoom;

    this.map = L.map(container, {
      center,
      zoom,
      scrollWheelZoom: true,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(this.map);

    this.markerLayer = L.layerGroup().addTo(this.map);
    this.refreshMarkers();

    // Fit bounds if multiple pins
    if (this.pinsSignal().length > 1) {
      const bounds = L.latLngBounds(
        this.pinsSignal().map((p) => [p.coordinates.latitude, p.coordinates.longitude] as L.LatLngTuple)
      );
      this.map.fitBounds(bounds.pad(0.15));
    }
  }

  private refreshMarkers(): void {
    if (!this.markerLayer || !this.map) return;

    this.markerLayer.clearLayers();

    const shopIcon = L.divIcon({
      className: 'seller-map-pin',
      html: `<div class="pin-dot"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16]
    });

    for (const pin of this.pinsSignal()) {
      const s = pin.seller;
      const name = s.businessName || s.name;
      const city = s.location?.city ?? '';
      const state = s.location?.state ?? '';
      const phone = s.phone ? `<div style="margin-top:.35rem;font-size:.8rem">📞 ${this.escapeHtml(s.phone)}</div>` : '';
      const email = s.email ? `<div style="font-size:.78rem;color:#64748b">${this.escapeHtml(s.email)}</div>` : '';
      const locationLine = [city, state].filter(Boolean).join(', ');

      const popupContent = `
        <div style="min-width:180px;font-family:Inter,sans-serif">
          <strong style="font-size:.9rem">${this.escapeHtml(name)}</strong>
          ${locationLine ? `<div style="font-size:.78rem;color:#64748b;margin-top:.15rem">${this.escapeHtml(locationLine)}</div>` : ''}
          ${email}${phone}
          <a href="https://www.google.com/maps/dir/?api=1&destination=${pin.coordinates.latitude},${pin.coordinates.longitude}"
            target="_blank" rel="noopener" style="display:inline-block;margin-top:.5rem;font-size:.78rem;color:#16a34a;text-decoration:none;font-weight:600">
            Get directions &#8594;
          </a>
        </div>
      `;

      L.marker([pin.coordinates.latitude, pin.coordinates.longitude], { icon: shopIcon })
        .bindPopup(popupContent, { maxWidth: 260 })
        .addTo(this.markerLayer!);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

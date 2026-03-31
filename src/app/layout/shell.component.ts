import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth/auth.service';
import { CartService } from '../core/data/cart.service';
import { LocationDiscoveryService } from '../core/location/location-discovery.service';
import { SavedLocation } from '../core/models/commerce.models';

interface ShellNavLink {
  route: string;
  label: string;
  exact?: boolean;
  badge?: number;
}

interface NavGroup {
  id: string;
  label: string;
  links: ShellNavLink[];
}

@Component({
  selector: 'app-shell',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, CurrencyPipe],
  template: `
    <div class="app-shell" [class.mobile-menu-open]="mobileMenuOpen() || mobileLocationSheetOpen()">
      <div class="nav-bar">
        <header class="page-section shell-header">
          <a class="brand-mark" routerLink="/" (click)="closeMobileMenu()">
            <div class="brand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div class="brand-text">
              <span class="brand-name">InvoiceHub B2B</span>
              <small class="brand-kicker">Cold Chain Commerce</small>
            </div>
          </a>

          <nav class="shell-nav shell-nav-desktop" aria-label="Primary navigation">
            @for (group of navGroups(); track group.id) {
              <div class="nav-dropdown" [class.is-open]="openDropdown() === group.id">
                <button class="nav-dropdown-trigger" type="button" (click)="toggleDropdown($event, group.id)">
                  {{ group.label }}
                  <svg class="nav-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="nav-dropdown-panel">
                  @for (link of group.links; track link.route) {
                    <a class="nav-dropdown-item" [routerLink]="link.route" routerLinkActive="active-link" [routerLinkActiveOptions]="link.exact ? exactRouteMatch : defaultRouteMatch" (click)="closeDropdowns()">
                      {{ link.label }}
                      @if (link.badge && link.badge > 0) { <span class="cart-count">{{ link.badge }}</span> }
                    </a>
                  }
                </div>
              </div>
            }
            @if (isBuyer()) {
              <a class="nav-standalone-link" routerLink="/cart" routerLinkActive="active-link" [routerLinkActiveOptions]="exactRouteMatch">
                Cart
                @if (cartService.totalItems() > 0) { <span class="cart-count">{{ cartService.totalItems() }}</span> }
              </a>
            }
          </nav>

          <div class="shell-actions shell-actions-desktop">
            @if (authService.profile(); as profile) {
              <div class="nav-dropdown user-pill-dropdown" [class.is-open]="openDropdown() === 'user'">
                <button class="user-pill user-pill-btn" type="button" (click)="toggleDropdown($event, 'user')">
                  <div class="user-avatar">{{ initials(profile.businessName || profile.name) }}</div>
                  <div class="user-info">
                    <span>{{ profile.businessName || profile.name }}</span>
                    <small>{{ roleLabel() }}</small>
                  </div>
                  <svg class="nav-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="nav-dropdown-panel user-dropdown-panel">
                  <a class="nav-dropdown-item" routerLink="/account" (click)="closeDropdowns()">My account</a>
                  <div class="dropdown-divider"></div>
                  <button class="nav-dropdown-item nav-dropdown-danger" type="button" (click)="logout()">Sign out</button>
                </div>
              </div>
            } @else {
              <a class="pill-link" routerLink="/login">Sign in</a>
              <a class="btn btn-primary" routerLink="/register">Create account</a>
            }
          </div>

          <div class="mobile-controls">
            @if (isBuyer()) {
              <a
                class="mobile-icon-button"
                routerLink="/cart"
                routerLinkActive="active-link"
                [routerLinkActiveOptions]="exactRouteMatch"
                aria-label="Open cart"
                (click)="closeMobileMenu()"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="9" cy="20" r="1"/>
                  <circle cx="18" cy="20" r="1"/>
                  <path d="M3 4h2l2.4 10.5a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L21 7H7"/>
                </svg>
                @if (cartService.totalItems() > 0) {
                  <span class="mobile-badge">{{ cartService.totalItems() }}</span>
                }
              </a>
            }

            <button
              class="mobile-icon-button menu-toggle"
              type="button"
              (click)="toggleMobileMenu()"
              [attr.aria-expanded]="mobileMenuOpen()"
              aria-controls="mobile-navigation"
              aria-label="Toggle navigation menu"
            >
              @if (!mobileMenuOpen()) {
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <line x1="4" y1="7" x2="20" y2="7"/>
                  <line x1="4" y1="12" x2="20" y2="12"/>
                  <line x1="4" y1="17" x2="20" y2="17"/>
                </svg>
              } @else {
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <line x1="6" y1="6" x2="18" y2="18"/>
                  <line x1="18" y1="6" x2="6" y2="18"/>
                </svg>
              }
            </button>
          </div>
        </header>

        <section class="page-section location-strip-wrap">
          <div class="location-strip">
            <div class="location-strip-main">
              <div class="location-pin-card">
                @if (currentPostalCode()) {
                  {{ currentPostalCode() }}
                } @else {
                  PIN
                }
              </div>

              <div class="location-strip-copy">
                <span class="location-strip-kicker">Delivery location</span>
                <strong>{{ currentLocationTitle() }}</strong>
                <p>{{ currentLocationSubtitle() }}</p>
              </div>
            </div>

            <div class="location-strip-actions">
              <button class="pill-link location-strip-desktop-action" type="button" (click)="toggleLocationPanel()">
                {{ locationPanelOpen() ? 'Close' : 'Change location' }}
              </button>
              <button class="btn btn-primary location-strip-button location-strip-desktop-action" type="button" (click)="useCurrentLocation()" [disabled]="locationDiscoveryService.loading() || locationDiscoveryService.permissionState() === 'unsupported'">
                {{ locationDiscoveryService.loading() ? 'Locating...' : 'Use current' }}
              </button>
              <button class="location-mobile-trigger" type="button" (click)="toggleMobileLocationSheet()" [attr.aria-expanded]="mobileLocationSheetOpen()" aria-controls="mobile-location-sheet">
                <div class="location-mobile-trigger-copy">
                  <span>{{ locationSourceLabel() }}</span>
                  <strong>{{ currentPostalCode() || 'Set PIN' }}</strong>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z"/>
                  <circle cx="12" cy="11" r="2.5"/>
                </svg>
              </button>
            </div>
          </div>

          @if (locationPanelOpen()) {
            <div class="surface-card location-panel">
              <div class="location-panel-head">
                <div>
                  <span class="eyebrow">Location control</span>
                  <h2 class="section-title">Update your delivery area</h2>
                  <p class="muted">This location is used across the app so users can understand the active PIN code and switch areas quickly.</p>
                </div>
                <span class="status-chip" [class.available]="locationDiscoveryService.permissionState() === 'granted'" [class.low]="locationDiscoveryService.permissionState() === 'manual'" [class.off]="locationDiscoveryService.permissionState() === 'denied' || locationDiscoveryService.permissionState() === 'unsupported'">
                  {{ permissionLabel() }}
                </span>
              </div>

              <div class="location-panel-grid">
                <div class="field">
                  <label for="manualCity">City</label>
                  <input #cityInput id="manualCity" type="text" [value]="manualCity()" (input)="manualCity.set(cityInput.value)" placeholder="Hyderabad" />
                </div>

                <div class="field">
                  <label for="manualState">State</label>
                  <input #stateInput id="manualState" type="text" [value]="manualState()" (input)="manualState.set(stateInput.value)" placeholder="Telangana" />
                </div>

                <div class="field">
                  <label for="manualPostalCode">PIN code</label>
                  <input #pinInput id="manualPostalCode" type="text" [value]="manualPostalCode()" (input)="manualPostalCode.set(pinInput.value)" placeholder="500081" />
                </div>

                <div class="location-panel-actions">
                  <button class="btn btn-secondary" type="button" (click)="applyManualLocation()" [disabled]="locationDiscoveryService.loading()">
                    Apply location
                  </button>
                </div>
              </div>

              @if (locationDiscoveryService.errorMessage()) {
                <p class="error-text">{{ locationDiscoveryService.errorMessage() }}</p>
              }
            </div>
          }
        </section>
      </div>

      @if (mobileMenuOpen() || mobileLocationSheetOpen()) {
        <button class="mobile-overlay" type="button" (click)="closeMobileOverlays()" aria-label="Close mobile overlay"></button>
      }

      <aside id="mobile-navigation" class="mobile-drawer" [class.is-open]="mobileMenuOpen()" [attr.aria-hidden]="!mobileMenuOpen()">
        <div class="mobile-drawer-head">
          <div>
            <span class="eyebrow">Quick access</span>
            <h2 class="section-title">Navigation</h2>
          </div>

          <button class="drawer-close" type="button" (click)="closeMobileMenu()" aria-label="Close navigation drawer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="6" y1="6" x2="18" y2="18"/>
              <line x1="18" y1="6" x2="6" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="mobile-drawer-body">
          @if (authService.profile(); as profile) {
            <div class="mobile-user-card">
              <div class="user-avatar">{{ initials(profile.businessName || profile.name) }}</div>
              <div class="mobile-user-copy">
                <strong>{{ profile.businessName || profile.name }}</strong>
                <small>{{ roleLabel() }}</small>
              </div>
            </div>
          }

          @if (isBuyer()) {
            <a class="mobile-cart-card" routerLink="/cart" (click)="closeMobileMenu()">
              <div>
                <span class="mobile-cart-label">Cart ready</span>
                <strong>{{ cartService.totalItems() }} item{{ cartService.totalItems() === 1 ? '' : 's' }}</strong>
              </div>
              <span>{{ cartService.totalAmount() | currency:'INR':'symbol':'1.0-2' }}</span>
            </a>
          }

          <nav class="mobile-nav" aria-label="Mobile navigation">
            @for (group of navGroups(); track group.id) {
              <div class="mobile-nav-group">
                <span class="mobile-nav-group-label">{{ group.label }}</span>
                @for (link of group.links; track link.route) {
                  <a class="mobile-nav-link" [routerLink]="link.route" routerLinkActive="active-link" [routerLinkActiveOptions]="link.exact ? exactRouteMatch : defaultRouteMatch" (click)="closeMobileMenu()">
                    <span>{{ link.label }}</span>
                    @if (link.badge && link.badge > 0) { <span class="cart-count">{{ link.badge }}</span> }
                  </a>
                }
              </div>
            }
            @if (isBuyer()) {
              <a class="mobile-nav-link" routerLink="/cart" routerLinkActive="active-link" [routerLinkActiveOptions]="exactRouteMatch" (click)="closeMobileMenu()">
                <span>Cart</span>
                @if (cartService.totalItems() > 0) { <span class="cart-count">{{ cartService.totalItems() }}</span> }
              </a>
            }
            @if (authService.profile()) {
              <a class="mobile-nav-link" routerLink="/account" routerLinkActive="active-link" [routerLinkActiveOptions]="exactRouteMatch" (click)="closeMobileMenu()">
                <span>My account</span>
              </a>
            }
          </nav>
        </div>

        <div class="mobile-drawer-footer">
          @if (authService.profile()) {
            <button class="btn btn-secondary mobile-footer-action" type="button" (click)="logout()">Sign out</button>
          } @else {
            <a class="pill-link mobile-footer-link" routerLink="/login" (click)="closeMobileMenu()">Sign in</a>
            <a class="btn btn-primary mobile-footer-action" routerLink="/register" (click)="closeMobileMenu()">Create account</a>
          }
        </div>
      </aside>

      <aside id="mobile-location-sheet" class="mobile-drawer mobile-location-sheet" [class.is-open]="mobileLocationSheetOpen()" [attr.aria-hidden]="!mobileLocationSheetOpen()">
        <div class="mobile-drawer-head mobile-location-sheet-head">
          <div>
            <span class="eyebrow">Delivery area</span>
            <h2 class="section-title">Change location</h2>
          </div>

          <button class="drawer-close" type="button" (click)="closeMobileLocationSheet()" aria-label="Close location sheet">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="6" y1="6" x2="18" y2="18"/>
              <line x1="18" y1="6" x2="6" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="mobile-drawer-body mobile-location-sheet-body">
          <div class="mobile-location-current">
            <div class="location-pin-card mobile-location-pin-card">{{ currentPostalCode() || 'PIN' }}</div>
            <div class="mobile-location-current-copy">
              <span>{{ locationSourceLabel() }}</span>
              <strong>{{ currentLocationTitle() }}</strong>
              <p>{{ currentLocationSubtitle() }}</p>
            </div>
          </div>

          <button class="btn btn-primary mobile-location-primary" type="button" (click)="useCurrentLocation()" [disabled]="locationDiscoveryService.loading() || locationDiscoveryService.permissionState() === 'unsupported'">
            {{ locationDiscoveryService.loading() ? 'Locating...' : 'Use current location' }}
          </button>

          <div class="field-grid mobile-location-fields">
            <div class="field">
              <label for="mobileManualCity">City</label>
              <input #mobileCityInput id="mobileManualCity" type="text" [value]="manualCity()" (input)="manualCity.set(mobileCityInput.value)" placeholder="Hyderabad" />
            </div>

            <div class="field-row mobile-location-row">
              <div class="field">
                <label for="mobileManualState">State</label>
                <input #mobileStateInput id="mobileManualState" type="text" [value]="manualState()" (input)="manualState.set(mobileStateInput.value)" placeholder="Telangana" />
              </div>

              <div class="field">
                <label for="mobileManualPostalCode">PIN code</label>
                <input #mobilePinInput id="mobileManualPostalCode" type="text" [value]="manualPostalCode()" (input)="manualPostalCode.set(mobilePinInput.value)" placeholder="500081" />
              </div>
            </div>
          </div>

          @if (locationDiscoveryService.errorMessage()) {
            <p class="error-text">{{ locationDiscoveryService.errorMessage() }}</p>
          }
        </div>

        <div class="mobile-drawer-footer mobile-location-sheet-footer">
          <button class="btn btn-secondary mobile-footer-action" type="button" (click)="applyManualLocation()" [disabled]="locationDiscoveryService.loading()">
            Apply location
          </button>
        </div>
      </aside>

      <router-outlet />
    </div>
  `,
  styles: []
})
export class ShellComponent {
  readonly authService = inject(AuthService);
  readonly cartService = inject(CartService);
  readonly locationDiscoveryService = inject(LocationDiscoveryService);
  readonly mobileMenuOpen = signal(false);
  readonly locationPanelOpen = signal(false);
  readonly mobileLocationSheetOpen = signal(false);
  readonly manualCity = signal('');
  readonly manualState = signal('');
  readonly manualPostalCode = signal('');
  readonly isBuyer = computed(() => this.authService.role() === 'buyer');
  readonly roleLabel = computed(() => (this.authService.role() === 'seller' ? 'Seller admin' : 'Buyer account'));
  readonly exactRouteMatch = { exact: true } as const;
  readonly defaultRouteMatch = { exact: false } as const;
  readonly currentPostalCode = computed(() => this.locationDiscoveryService.currentLocation()?.postalCode || '');
  readonly currentLocationTitle = computed(() => {
    const location = this.locationDiscoveryService.currentLocation();
    if (!location) {
      return 'Set your city or PIN code';
    }

    return [location.city, location.state].filter(Boolean).join(', ') || location.label || this.coordinateLabel(location);
  });
  readonly currentLocationSubtitle = computed(() => {
    const location = this.locationDiscoveryService.currentLocation();
    if (!location) {
      switch (this.locationDiscoveryService.permissionState()) {
        case 'denied':
          return 'Location was denied. Enter a city or PIN code to continue checking places and products.';
        case 'unsupported':
          return 'This browser does not support geolocation. Use manual location entry instead.';
        default:
          return 'Use browser location or manually enter a city and PIN code.';
      }
    }

    const label = [location.postalCode, location.country].filter(Boolean).join(' · ');
    return label || (location.source === 'browser' ? 'Detected from your current device location.' : 'Saved from manual location input.');
  });
  readonly permissionLabel = computed(() => {
    switch (this.locationDiscoveryService.permissionState()) {
      case 'granted':
        return 'Live location';
      case 'manual':
        return 'Manual location';
      case 'denied':
        return 'Permission denied';
      case 'unsupported':
        return 'Geo unsupported';
      case 'prompt':
        return 'Awaiting permission';
      default:
        return 'Location idle';
    }
  });
  readonly locationSourceLabel = computed(() => {
    const location = this.locationDiscoveryService.currentLocation();
    if (!location) {
      return 'Set location';
    }

    return location.source === 'browser' ? 'Live location' : 'Manual location';
  });
  readonly openDropdown = signal<string | null>(null);

  readonly navGroups = computed<NavGroup[]>(() => {
    const groups: NavGroup[] = [
      {
        id: 'explore',
        label: 'Explore',
        links: [
          { route: '/catalog', label: 'Catalog' },
          { route: '/maps', label: 'Shop map' }
        ]
      }
    ];

    if (this.authService.profile()) {
      const businessLinks: ShellNavLink[] = [
        { route: '/dashboard', label: 'Dashboard', exact: true }
      ];

      if (this.authService.role() === 'seller') {
        businessLinks.push({ route: '/seller', label: 'Seller desk' });
        businessLinks.push({ route: '/seller/orders', label: 'Orders' });
      }

      if (this.authService.role() === 'buyer') {
        businessLinks.push({ route: '/buyer', label: 'Buyer hub' });
        businessLinks.push({ route: '/buyer/orders', label: 'Orders' });
      }

      businessLinks.push({ route: '/business-profile', label: 'Personal Finance' });

      groups.push({
        id: 'business',
        label: 'My Business',
        links: businessLinks
      });
    }

    return groups;
  });

  constructor() {
    this.seedManualInputs(this.locationDiscoveryService.currentLocation());
    void this.locationDiscoveryService.ensureLocationRequestedOnLoad();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeMobileOverlays();
    this.locationPanelOpen.set(false);
    this.closeDropdowns();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (typeof window !== 'undefined' && window.innerWidth > 900) {
      this.closeMobileOverlays();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeDropdowns();
  }

  toggleMobileMenu(): void {
    this.locationPanelOpen.set(false);
    this.mobileLocationSheetOpen.set(false);
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleDropdown(event: Event, id: string): void {
    event.stopPropagation();
    this.openDropdown.update(current => current === id ? null : id);
  }

  closeDropdowns(): void {
    this.openDropdown.set(null);
  }

  closeMobileOverlays(): void {
    this.mobileMenuOpen.set(false);
    this.mobileLocationSheetOpen.set(false);
  }

  toggleLocationPanel(): void {
    this.seedManualInputs(this.locationDiscoveryService.currentLocation());
    this.locationDiscoveryService.clearError();
    this.mobileLocationSheetOpen.set(false);
    this.locationPanelOpen.update((open) => !open);
  }

  toggleMobileLocationSheet(): void {
    this.seedManualInputs(this.locationDiscoveryService.currentLocation());
    this.locationDiscoveryService.clearError();
    this.mobileMenuOpen.set(false);
    this.locationPanelOpen.set(false);
    this.mobileLocationSheetOpen.update((open) => !open);
  }

  closeMobileLocationSheet(): void {
    this.mobileLocationSheetOpen.set(false);
  }

  async useCurrentLocation(): Promise<void> {
    const location = await this.locationDiscoveryService.requestBrowserLocation();
    if (location) {
      this.seedManualInputs(location);
      this.locationPanelOpen.set(false);
      this.mobileLocationSheetOpen.set(false);
    }
  }

  async applyManualLocation(): Promise<void> {
    const location = await this.locationDiscoveryService.applyManualLocation({
      city: this.manualCity(),
      state: this.manualState(),
      postalCode: this.manualPostalCode()
    });

    if (location) {
      this.seedManualInputs(location);
      this.locationPanelOpen.set(false);
      this.mobileLocationSheetOpen.set(false);
    }
  }

  initials(name: string): string {
    return (name || '?')
      .split(' ')
      .filter((w) => w.length > 0)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  async logout(): Promise<void> {
    this.closeMobileOverlays();
    await this.authService.logout();
  }

  private seedManualInputs(location: SavedLocation | null): void {
    this.manualCity.set(location?.city || '');
    this.manualState.set(location?.state || '');
    this.manualPostalCode.set(location?.postalCode || '');
  }

  private coordinateLabel(location: SavedLocation): string {
    return `${location.coordinates.latitude.toFixed(4)}, ${location.coordinates.longitude.toFixed(4)}`;
  }
}
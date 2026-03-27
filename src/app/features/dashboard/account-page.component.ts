import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AddressService } from '../../core/data/address.service';
import { OrderService } from '../../core/data/order.service';
import { ProductService } from '../../core/data/product.service';

@Component({
  selector: 'app-account-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe, TitleCasePipe],
  template: `
    <section class="page-section account-layout">
      <header class="surface-card account-hero">
        <div>
          <span class="eyebrow">My account</span>
          <h1 class="section-title">{{ profileHeading() }}</h1>
          <p class="muted">Manage profile information, review business stats, and keep contact details up to date for orders and invoices.</p>
        </div>

        <div class="cta-row">
          <a class="btn btn-secondary" [routerLink]="homeLink()">Back to workspace</a>
          <a class="btn btn-primary" [routerLink]="ordersLink()">View order history</a>
        </div>
      </header>

      <div class="account-grid">
        <section class="surface-card account-form-card">
          <div class="account-profile-head">
            <div class="account-avatar">{{ initials() }}</div>
            <div>
              <h2 class="section-title">Profile details</h2>
              <p class="muted">{{ authService.profile()?.email }}</p>
            </div>
          </div>

          <form class="field-grid" [formGroup]="form" (ngSubmit)="save()">
            <div class="field-row">
              <div class="field">
                <label for="name">Full name</label>
                <input id="name" type="text" formControlName="name" placeholder="Your full name" />
              </div>

              <div class="field">
                <label for="businessName">Business name</label>
                <input id="businessName" type="text" formControlName="businessName" placeholder="Business or store name" />
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="phone">Phone</label>
                <input id="phone" type="tel" formControlName="phone" placeholder="9876543210" />
              </div>

              <div class="field">
                <label for="email">Email</label>
                <input id="email" type="email" [value]="authService.profile()?.email || ''" readonly />
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="role">Account type</label>
                <input id="role" type="text" [value]="roleLabel()" readonly />
              </div>

              <div class="field">
                <label for="createdAt">Member since</label>
                <input id="createdAt" type="text" [value]="memberSince()" readonly />
              </div>
            </div>

            @if (saveError()) {
              <p class="error-text">{{ saveError() }}</p>
            }

            @if (saveSuccess()) {
              <p class="status-chip available">{{ saveSuccess() }}</p>
            }

            <button class="btn btn-primary" type="submit" [disabled]="form.invalid || saving()">
              {{ saving() ? 'Saving changes...' : 'Save profile' }}
            </button>
          </form>
        </section>

        <div class="panel-grid">
          <section class="surface-card account-metrics">
            <div class="metric-grid">
              <article class="metric-card">
                <strong>{{ totalOrders() }}</strong>
                <span>Total orders</span>
              </article>
              <article class="metric-card">
                <strong>{{ primaryAmount() | currency:'INR':'symbol':'1.0-2' }}</strong>
                <span>{{ primaryAmountLabel() }}</span>
              </article>
              <article class="metric-card">
                <strong>{{ secondaryCount() }}</strong>
                <span>{{ secondaryCountLabel() }}</span>
              </article>
              <article class="metric-card">
                <strong>{{ tertiaryCount() }}</strong>
                <span>{{ tertiaryCountLabel() }}</span>
              </article>
            </div>
          </section>

          <section class="surface-card summary-card">
            <div class="summary-head">
              <h2 class="section-title">Recent activity</h2>
              <a class="pill-link" [routerLink]="ordersLink()">Full order history</a>
            </div>

            @if (!recentOrders().length) {
              <div class="empty-state">No order activity yet. Once orders are placed, buyer and seller history will appear here.</div>
            } @else {
              <div class="activity-list">
                @for (order of recentOrders(); track order.id) {
                  <article class="activity-row">
                    <div>
                      <strong>{{ activityTitle(order) }}</strong>
                      <p class="muted">{{ order.createdAt | date:'medium' }} · {{ order.status | titlecase }}</p>
                    </div>
                    <span>{{ order.totalAmount | currency:'INR':'symbol':'1.0-2' }}</span>
                  </article>
                }
              </div>
            }
          </section>

          <section class="surface-card summary-card">
            <h2 class="section-title">{{ roleSpecificPanelTitle() }}</h2>

            @if (authService.role() === 'buyer') {
              <div class="detail-stack">
                <div class="detail-row">
                  <span>Saved addresses</span>
                  <strong>{{ addressService.addresses().length }}</strong>
                </div>
                <div class="detail-row">
                  <span>Default address</span>
                  <strong>{{ defaultAddressLabel() }}</strong>
                </div>
                <div class="detail-row">
                  <span>Pending or confirmed orders</span>
                  <strong>{{ activeBuyerOrders() }}</strong>
                </div>
              </div>
            } @else {
              <div class="detail-stack">
                <div class="detail-row">
                  <span>Products listed</span>
                  <strong>{{ productService.sellerProducts().length }}</strong>
                </div>
                <div class="detail-row">
                  <span>Active listings</span>
                  <strong>{{ activeListings() }}</strong>
                </div>
                <div class="detail-row">
                  <span>Delivered revenue</span>
                  <strong>{{ deliveredRevenue() | currency:'INR':'symbol':'1.0-2' }}</strong>
                </div>
              </div>
            }
          </section>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .account-layout {
        display: grid;
        gap: 1.5rem;
        padding: 2rem 0 3rem;
      }

      .account-hero,
      .account-form-card,
      .account-metrics,
      .summary-card {
        padding: 1.5rem;
      }

      .account-hero {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .account-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
        gap: 1.5rem;
      }

      .account-profile-head,
      .summary-head,
      .detail-row,
      .activity-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .account-profile-head {
        margin-bottom: 1.5rem;
      }

      .account-avatar {
        width: 60px;
        height: 60px;
        border-radius: 16px;
        background: var(--brand-light);
        color: var(--brand-dark);
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.1rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }

      .metric-card {
        padding: 1rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--surface-2);
        display: grid;
        gap: 0.35rem;
      }

      .metric-card strong {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.55rem;
      }

      .activity-list,
      .detail-stack {
        display: grid;
        gap: 0.9rem;
        margin-top: 1rem;
      }

      .activity-row,
      .detail-row {
        padding: 0.95rem 1rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: var(--surface-2);
      }

      .activity-row strong,
      .detail-row strong {
        font-family: 'Plus Jakarta Sans', sans-serif;
      }

      @media (max-width: 960px) {
        .account-grid {
          grid-template-columns: 1fr;
        }

        .account-hero {
          flex-direction: column;
          align-items: flex-start;
        }
      }

      @media (max-width: 720px) {
        .metric-grid {
          grid-template-columns: 1fr;
        }

        .summary-head,
        .detail-row,
        .activity-row,
        .account-profile-head {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `
  ]
})
export class AccountPageComponent {
  readonly authService = inject(AuthService);
  readonly addressService = inject(AddressService);
  readonly orderService = inject(OrderService);
  readonly productService = inject(ProductService);
  private readonly formBuilder = inject(FormBuilder);

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal<string | null>(null);
  readonly profileHeading = computed(() =>
    this.authService.role() === 'seller'
      ? 'Manage your seller profile and business overview'
      : 'Manage your buyer profile and purchasing details'
  );
  readonly homeLink = computed(() => (this.authService.role() === 'seller' ? '/seller' : '/buyer'));
  readonly ordersLink = computed(() => (this.authService.role() === 'seller' ? '/seller/orders' : '/buyer/orders'));
  readonly roleLabel = computed(() => (this.authService.role() === 'seller' ? 'Seller account' : 'Buyer account'));
  readonly currentOrders = computed(() => (this.authService.role() === 'seller' ? this.orderService.sellerOrders() : this.orderService.buyerOrders()));
  readonly totalOrders = computed(() => this.currentOrders().length);
  readonly totalSpend = computed(() => this.orderService.buyerOrders().reduce((sum, order) => sum + order.totalAmount, 0));
  readonly sellerRevenue = computed(() =>
    this.orderService
      .sellerOrders()
      .filter((order) => order.status === 'confirmed' || order.status === 'delivered')
      .reduce((sum, order) => sum + order.totalAmount, 0)
  );
  readonly deliveredRevenue = computed(() =>
    this.orderService
      .sellerOrders()
      .filter((order) => order.status === 'delivered')
      .reduce((sum, order) => sum + order.totalAmount, 0)
  );
  readonly activeBuyerOrders = computed(() =>
    this.orderService.buyerOrders().filter((order) => order.status === 'pending' || order.status === 'confirmed').length
  );
  readonly activeListings = computed(() => this.productService.sellerProducts().filter((product) => product.isAvailable).length);
  readonly recentOrders = computed(() => this.currentOrders().slice(0, 4));
  readonly defaultAddressLabel = computed(() => {
    const address = this.addressService.defaultAddress();
    return address ? address.label : 'Not set';
  });
  readonly primaryAmount = computed(() => (this.authService.role() === 'seller' ? this.sellerRevenue() : this.totalSpend()));
  readonly primaryAmountLabel = computed(() => (this.authService.role() === 'seller' ? 'Gross sales' : 'Total spend'));
  readonly secondaryCount = computed(() =>
    this.authService.role() === 'seller'
      ? this.orderService.sellerOrders().filter((order) => order.status === 'pending').length
      : this.addressService.addresses().length
  );
  readonly secondaryCountLabel = computed(() => (this.authService.role() === 'seller' ? 'Pending orders' : 'Saved addresses'));
  readonly tertiaryCount = computed(() =>
    this.authService.role() === 'seller'
      ? this.activeListings()
      : this.orderService.buyerOrders().filter((order) => order.invoiceUrl).length
  );
  readonly tertiaryCountLabel = computed(() => (this.authService.role() === 'seller' ? 'Active listings' : 'Invoices ready'));
  readonly roleSpecificPanelTitle = computed(() =>
    this.authService.role() === 'seller' ? 'Seller operations snapshot' : 'Buyer delivery snapshot'
  );
  readonly memberSince = computed(() => {
    const createdAt = this.authService.profile()?.createdAt;
    return createdAt ? new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  });
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    businessName: [''],
    phone: ['']
  });

  constructor() {
    effect(() => {
      const profile = this.authService.profile();
      if (!profile) {
        return;
      }

      this.form.patchValue(
        {
          name: profile.name,
          businessName: profile.businessName || '',
          phone: profile.phone || ''
        },
        { emitEvent: false }
      );
    });
  }

  initials(): string {
    const source = this.authService.profile()?.businessName || this.authService.profile()?.name || '?';
    return source
      .split(' ')
      .filter((word) => word.length > 0)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  activityTitle(order: { sellerName: string; buyerBusinessName?: string; buyerName: string }): string {
    return this.authService.role() === 'seller' ? order.buyerBusinessName || order.buyerName : order.sellerName;
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    const value = this.form.getRawValue();

    try {
      await this.authService.updateProfile({
        name: value.name.trim(),
        businessName: value.businessName.trim() || undefined,
        phone: value.phone.trim() || undefined
      });
      this.saveSuccess.set('Account updated successfully.');
    } catch (error) {
      this.saveError.set(error instanceof Error ? error.message : 'Could not update your account.');
    } finally {
      this.saving.set(false);
    }
  }
}
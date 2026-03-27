import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AddressService } from '../../core/data/address.service';
import { CartService } from '../../core/data/cart.service';
import { OrderService } from '../../core/data/order.service';
import { ProductService } from '../../core/data/product.service';
import { Address } from '../../core/models/commerce.models';

@Component({
  selector: 'app-buyer-dashboard-page',
  imports: [CommonModule, RouterLink, CurrencyPipe, DatePipe, TitleCasePipe],
  template: `
    <section class="page-section buyer-layout">
      <header class="surface-card buyer-hero">
        <div>
          <span class="eyebrow">Buyer dashboard</span>
          <h1 class="section-title">Welcome back, {{ authService.profile()?.name }}</h1>
          <p class="muted">Track orders, manage delivery details, monitor spend, and move quickly between catalog, cart, and account operations.</p>
        </div>

        <div class="cta-row">
          <a class="btn btn-primary" routerLink="/catalog">Browse products</a>
          <a class="btn btn-secondary" routerLink="/cart">Cart and checkout</a>
          <a class="btn btn-secondary" routerLink="/account">My account</a>
        </div>
      </header>

      <div class="buyer-panels">
        <article class="surface-card buyer-card accent-card">
          <span>Total spend</span>
          <strong>{{ totalSpend() | currency:'INR':'symbol':'1.0-2' }}</strong>
          <small class="muted">Across all buyer orders</small>
        </article>

        <article class="surface-card buyer-card">
          <span>Orders placed</span>
          <strong>{{ orderService.buyerOrders().length }}</strong>
          <small class="muted">History with live status updates</small>
        </article>

        <article class="surface-card buyer-card">
          <span>Active orders</span>
          <strong>{{ activeOrders() }}</strong>
          <small class="muted">Pending or confirmed right now</small>
        </article>

        <article class="surface-card buyer-card">
          <span>Invoices ready</span>
          <strong>{{ invoicesReady() }}</strong>
          <small class="muted">Available for PDF download</small>
        </article>
      </div>

      <div class="buyer-main-grid">
        <section class="surface-card workspace-card">
          <div class="section-head">
            <div>
              <h2 class="section-title">Recent order history</h2>
              <p class="muted">The latest buyer orders with totals, status, and seller context.</p>
            </div>
            <a class="pill-link" routerLink="/buyer/orders">Open full history</a>
          </div>

          @if (!recentOrders().length) {
            <div class="empty-state">No buyer orders yet. Place a COD order from the cart to start your order history.</div>
          } @else {
            <div class="history-list">
              @for (order of recentOrders(); track order.id) {
                <article class="history-row">
                  <div>
                    <strong>Order {{ order.id }}</strong>
                    <p class="muted">{{ order.sellerName }} · {{ order.createdAt | date:'medium' }}</p>
                  </div>

                  <div class="history-meta">
                    <span class="status-chip" [class.available]="order.status === 'delivered' || order.status === 'confirmed'" [class.low]="order.status === 'pending'" [class.off]="order.status === 'cancelled'">
                      {{ order.status | titlecase }}
                    </span>
                    <strong>{{ order.totalAmount | currency:'INR':'symbol':'1.0-2' }}</strong>
                  </div>
                </article>
              }
            </div>
          }
        </section>

        <div class="panel-grid">
          <section class="surface-card workspace-card">
            <div class="section-head">
              <div>
                <h2 class="section-title">Delivery and account</h2>
                <p class="muted">Address readiness and account details used for fulfillment.</p>
              </div>
              <a class="pill-link" routerLink="/account">Edit account</a>
            </div>

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
                <span>Phone</span>
                <strong>{{ authService.profile()?.phone || 'Not added yet' }}</strong>
              </div>
              <div class="detail-row">
                <span>Business name</span>
                <strong>{{ authService.profile()?.businessName || authService.profile()?.name }}</strong>
              </div>
            </div>
          </section>

          <section class="surface-card workspace-card">
            <div class="section-head">
              <div>
                <h2 class="section-title">Purchasing snapshot</h2>
                <p class="muted">Quick signals from catalog, cart, and order data.</p>
              </div>
            </div>

            <div class="detail-stack">
              <div class="detail-row">
                <span>Live products available</span>
                <strong>{{ liveProductCount() }}</strong>
              </div>
              <div class="detail-row">
                <span>Items in cart</span>
                <strong>{{ cartService.totalItems() }}</strong>
              </div>
              <div class="detail-row">
                <span>Cart value</span>
                <strong>{{ cartService.totalAmount() | currency:'INR':'symbol':'1.0-2' }}</strong>
              </div>
              <div class="detail-row">
                <span>Last delivery location</span>
                <strong>{{ compactAddress(addressService.defaultAddress()) }}</strong>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .buyer-layout {
        display: grid;
        gap: 1.5rem;
        padding: 2rem 0 3rem;
      }

      .buyer-hero,
      .buyer-card,
      .workspace-card {
        padding: 1.5rem;
      }

      .buyer-hero,
      .section-head,
      .history-row,
      .detail-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .buyer-panels {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .buyer-main-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
        gap: 1.5rem;
      }

      .buyer-card {
        display: grid;
        gap: 0.35rem;
      }

      .buyer-card strong {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.8rem;
      }

      .accent-card {
        background: linear-gradient(135deg, #0f7a37 0%, #16a34a 100%);
        color: #fff;
        border: none;
      }

      .accent-card .muted {
        color: rgba(255, 255, 255, 0.78);
      }

      .history-list,
      .detail-stack {
        display: grid;
        gap: 0.9rem;
        margin-top: 1rem;
      }

      .history-row,
      .detail-row {
        padding: 1rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: var(--surface-2);
      }

      .history-row strong,
      .detail-row strong {
        font-family: 'Plus Jakarta Sans', sans-serif;
      }

      .history-meta {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      @media (max-width: 980px) {
        .buyer-main-grid {
          grid-template-columns: 1fr;
        }

        .buyer-panels {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .buyer-hero {
          flex-direction: column;
          align-items: flex-start;
        }
      }

      @media (max-width: 720px) {
        .buyer-panels {
          grid-template-columns: 1fr;
        }

        .section-head,
        .history-row,
        .detail-row {
          flex-direction: column;
          align-items: flex-start;
        }

        .history-meta {
          width: 100%;
          justify-content: space-between;
        }
      }
    `
  ]
})
export class BuyerDashboardPageComponent {
  readonly authService = inject(AuthService);
  readonly addressService = inject(AddressService);
  readonly cartService = inject(CartService);
  readonly orderService = inject(OrderService);
  readonly productService = inject(ProductService);
  readonly liveProductCount = computed(() => this.productService.availableProducts().length);
  readonly recentOrders = computed(() => this.orderService.buyerOrders().slice(0, 5));
  readonly totalSpend = computed(() => this.orderService.buyerOrders().reduce((sum, order) => sum + order.totalAmount, 0));
  readonly activeOrders = computed(() =>
    this.orderService.buyerOrders().filter((order) => order.status === 'pending' || order.status === 'confirmed').length
  );
  readonly invoicesReady = computed(() => this.orderService.buyerOrders().filter((order) => order.invoiceUrl).length);
  readonly defaultAddressLabel = computed(() => {
    const address = this.addressService.defaultAddress();
    return address ? address.label : 'Not set yet';
  });

  compactAddress(address: Address | null): string {
    if (!address) {
      return 'No default address';
    }

    return [address.city, address.state].filter(Boolean).join(', ');
  }
}
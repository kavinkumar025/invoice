import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AddressService } from '../../core/data/address.service';
import { CartService } from '../../core/data/cart.service';
import { OrderService } from '../../core/data/order.service';
import { ProductService } from '../../core/data/product.service';

@Component({
  selector: 'app-buyer-dashboard-page',
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-section buyer-layout">
      <header class="surface-card buyer-header">
        <div>
          <span class="eyebrow">Buyer hub</span>
          <h1 class="section-title">Welcome back, {{ authService.profile()?.name }}</h1>
          <p class="muted">This buyer workspace now covers cart review, saved delivery addresses, COD checkout, order history, and invoice download links.</p>
        </div>

        <div class="cta-row">
          <a class="btn btn-primary" routerLink="/catalog">Browse products</a>
          <a class="btn btn-secondary" routerLink="/cart">Cart and checkout</a>
        </div>
      </header>

      <div class="buyer-panels">
        <article class="surface-card buyer-card">
          <strong>{{ liveProductCount() }}</strong>
          <span>Live products available</span>
        </article>

        <article class="surface-card buyer-card">
          <strong>{{ cartService.totalItems() }}</strong>
          <span>Items currently in cart</span>
        </article>

        <article class="surface-card buyer-card">
          <strong>{{ orderService.buyerOrders().length }}</strong>
          <span>Orders with live RTDB status updates</span>
        </article>

        <article class="surface-card buyer-card">
          <strong>{{ addressService.addresses().length }}</strong>
          <span>Saved delivery addresses</span>
        </article>
      </div>

      <div class="cta-row">
        <a class="pill-link" routerLink="/buyer/orders">View orders and invoices</a>
        <a class="pill-link" routerLink="/cart">Manage addresses and COD checkout</a>
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

      .buyer-header {
        padding: 1.75rem;
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

      .buyer-card {
        padding: 1.5rem;
        display: grid;
        gap: 0.35rem;
      }

      .buyer-card strong {
        font-family: 'Manrope', sans-serif;
        font-size: 2rem;
      }

      @media (max-width: 860px) {
        .buyer-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .buyer-panels {
          grid-template-columns: 1fr;
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
}
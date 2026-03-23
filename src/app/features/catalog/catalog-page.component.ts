import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/data/cart.service';
import { ProductService } from '../../core/data/product.service';
import { Product } from '../../core/models/commerce.models';

@Component({
  selector: 'app-catalog-page',
  imports: [CommonModule, FormsModule, CurrencyPipe, RouterLink],
  template: `
    <section class="page-section catalog-layout">
      <div class="catalog-header">
        <div>
          <span class="eyebrow">Buyer storefront</span>
          <h1 class="section-title">Fresh, frozen, and perishable stock from your supplier network</h1>
        </div>

        <div class="surface-card catalog-filters">
          <div class="field">
            <label for="search">Search</label>
            <input id="search" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Idli batter, fish fillet, chicken" />
          </div>

          <div class="field">
            <label for="category">Category</label>
            <input id="category" type="search" [ngModel]="category()" (ngModelChange)="category.set($event)" placeholder="Frozen food, seafood" />
          </div>
        </div>

        @if (authService.role() === 'buyer') {
          <a class="btn btn-secondary" routerLink="/cart">Open cart ({{ cartService.totalItems() }})</a>
        }
      </div>

      @if (productService.loading()) {
        <div class="surface-card empty-state">Loading catalog from Realtime Database...</div>
      } @else if (!filteredProducts().length) {
        <div class="surface-card empty-state">No products match the current filter yet. Seller accounts can add products from the seller desk.</div>
      } @else {
        <div class="catalog-grid">
          @for (product of filteredProducts(); track product.id) {
            <article class="surface-card catalog-card">
              <div class="card-head">
                <span class="status-chip" [class.available]="product.stock > 20" [class.low]="product.stock > 0 && product.stock <= 20" [class.off]="product.stock === 0">
                  {{ stockLabel(product) }}
                </span>
                <span class="muted">{{ product.category }}</span>
              </div>

              <div>
                <h2>{{ product.name }}</h2>
                <p class="muted">{{ product.description || 'Cold-chain ready product listing.' }}</p>
              </div>

              <dl>
                <div>
                  <dt>Seller</dt>
                  <dd>{{ product.sellerName }}</dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd>{{ product.price | currency:'INR':'symbol':'1.0-2' }} / {{ unitLabel(product) }}</dd>
                </div>
                <div>
                  <dt>Stock</dt>
                  <dd>{{ product.stock }} {{ unitLabel(product) }}</dd>
                </div>
              </dl>

              <button class="btn btn-primary" type="button" [disabled]="product.stock === 0 || authService.role() !== 'buyer'" (click)="addToCart(product)">
                {{ authService.role() === 'buyer' ? 'Add to cart' : 'Buyer sign-in required' }}
              </button>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .catalog-layout {
        display: grid;
        gap: 1.5rem;
        padding: 2rem 0 3rem;
      }

      .catalog-header {
        display: grid;
        gap: 1rem;
      }

      .catalog-filters {
        display: grid;
        gap: 1rem;
        padding: 1rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .catalog-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }

      .catalog-card {
        padding: 1.25rem;
        display: grid;
        gap: 1rem;
      }

      .catalog-card h2 {
        margin: 0 0 0.4rem;
        font-family: 'Manrope', sans-serif;
      }

      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }

      dl {
        display: grid;
        gap: 0.7rem;
        margin: 0;
      }

      dl div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      dt {
        color: var(--text-secondary);
      }

      dd {
        margin: 0;
        font-weight: 700;
      }

      @media (max-width: 720px) {
        .catalog-filters {
          grid-template-columns: 1fr;
        }
      }
    `
  ]
})
export class CatalogPageComponent {
  readonly authService = inject(AuthService);
  readonly cartService = inject(CartService);
  readonly productService = inject(ProductService);
  readonly query = signal('');
  readonly category = signal('');
  readonly filteredProducts = computed(() => {
    const search = this.query().trim().toLowerCase();
    const category = this.category().trim().toLowerCase();

    return this.productService.availableProducts().filter((product) => {
      const matchesSearch =
        !search ||
        product.name.toLowerCase().includes(search) ||
        product.sellerName.toLowerCase().includes(search) ||
        (product.description?.toLowerCase().includes(search) ?? false);
      const matchesCategory = !category || product.category.toLowerCase().includes(category);
      return matchesSearch && matchesCategory;
    });
  });

  unitLabel(product: Product): string {
    return product.unit === 'custom' ? product.customUnitLabel || 'unit' : product.unit;
  }

  stockLabel(product: Product): string {
    if (!product.stock) {
      return 'Out of stock';
    }

    return product.stock <= 20 ? 'Low stock' : 'Available';
  }

  addToCart(product: Product): void {
    this.cartService.addProduct(product);
  }
}
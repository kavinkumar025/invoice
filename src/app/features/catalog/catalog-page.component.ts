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
              @if (product.imageUrl) {
                <img class="catalog-product-img" [src]="product.imageUrl" [alt]="product.name" />
              }

              <div class="card-head">
                <span class="status-chip" [class.available]="product.stock > 20" [class.low]="product.stock > 0 && product.stock <= 20" [class.off]="product.stock === 0">
                  {{ stockLabel(product) }}
                </span>
                <span class="card-category">{{ product.category }}</span>
              </div>

              <div class="card-body">
                <h2 class="card-name">{{ product.name }}</h2>
                <p class="muted card-desc">{{ product.description || 'Cold-chain ready product.' }}</p>
              </div>

              <div class="card-price-row">
                <div>
                  <div class="card-price">{{ product.price | currency:'INR':'symbol':'1.0-2' }}</div>
                  <div class="card-unit">per {{ unitLabel(product) }}</div>
                </div>
                <div class="card-stock">
                  <span class="stock-num">{{ product.stock }}</span>
                  <span class="stock-label">{{ unitLabel(product) }} in stock</span>
                </div>
              </div>

              <div class="card-seller">
                <span class="seller-dot"></span>
                {{ product.sellerName }}
              </div>

              <button class="btn btn-primary card-btn" type="button" [disabled]="product.stock === 0 || authService.role() !== 'buyer'" (click)="addToCart(product)">
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
        gap: 2rem;
        padding: 2.5rem 0 4rem;
      }

      .catalog-header {
        display: grid;
        gap: 1.25rem;
      }

      .catalog-filters {
        display: grid;
        gap: 1rem;
        padding: 1.25rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .catalog-grid {
        display: grid;
        gap: 1.25rem;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      }

      .catalog-card {
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0;
        overflow: hidden;
        transition: box-shadow 200ms ease, transform 200ms ease;
      }

      .catalog-card:hover {
        box-shadow: var(--shadow-lg);
        transform: translateY(-3px);
      }

      .catalog-product-img {
        width: 100%;
        height: 180px;
        object-fit: cover;
        display: block;
        flex-shrink: 0;
      }

      .catalog-card .card-head,
      .catalog-card .card-body,
      .catalog-card .card-price-row,
      .catalog-card .card-seller,
      .catalog-card .card-btn {
        padding-left: 1.25rem;
        padding-right: 1.25rem;
      }

      .catalog-card .card-head { padding-top: 1.25rem; margin-bottom: 1rem; }
      .catalog-card .card-body { padding-left: 1.25rem; padding-right: 1.25rem; margin-bottom: 1rem; flex: 1; }
      .catalog-card .card-price-row { padding: 0.875rem 1.25rem; margin-bottom: 0.75rem; }
      .catalog-card .card-seller { padding-left: 1.25rem; padding-right: 1.25rem; margin-bottom: 1rem; }
      .catalog-card .card-btn { padding-bottom: 1.25rem; }

      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .card-category {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
      }

      .card-body {}

      .card-name {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.1rem;
        font-weight: 700;
        margin: 0 0 0.4rem;
        line-height: 1.3;
      }

      .card-desc {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .card-price-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 0.875rem 0;
        border-top: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
      }

      .card-price {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--text-primary);
        line-height: 1;
      }

      .card-unit {
        font-size: 0.78rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }

      .card-stock { text-align: right; }

      .stock-num {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.1rem;
        font-weight: 700;
        display: block;
        line-height: 1;
      }

      .stock-label {
        font-size: 0.72rem;
        color: var(--text-secondary);
        display: block;
        margin-top: 0.2rem;
      }

      .card-seller {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.825rem;
        color: var(--text-secondary);
        font-weight: 500;
      }

      .seller-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--brand);
        flex-shrink: 0;
      }

      .card-btn {
        width: 100%;
        padding: 0.7rem;
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
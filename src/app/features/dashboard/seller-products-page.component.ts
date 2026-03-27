import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ProductService } from '../../core/data/product.service';
import { Product, UnitCode, unitOptions } from '../../core/models/commerce.models';

@Component({
  selector: 'app-seller-products-page',
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe],
  template: `
    <section class="page-section seller-layout">
      <header class="seller-header">
        <div>
          <span class="eyebrow">Seller desk</span>
          <h1 class="section-title">Manage live products in Realtime Database</h1>
          <p class="muted">This is the first seller workflow: add stock, publish products, and control catalog availability.</p>
        </div>

        <div class="seller-stats">
          <article class="surface-card stat-card">
            <strong>{{ sellerProducts().length }}</strong>
            <span>Products</span>
          </article>
          <article class="surface-card stat-card">
            <strong>{{ activeCount() }}</strong>
            <span>Active listings</span>
          </article>
        </div>
      </header>

      <div class="seller-grid">
        <form class="surface-card seller-form field-grid" [formGroup]="form" (ngSubmit)="submit()">
          <div>
            <h2 class="section-title">Add product</h2>
            <p class="muted">Use custom unit only when Kg, Liter, or Piece does not fit the product.</p>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="name">Product name</label>
              <input id="name" type="text" formControlName="name" placeholder="Idli Batter" />
            </div>

            <div class="field">
              <label for="category">Category</label>
              <input id="category" type="text" formControlName="category" placeholder="Frozen Food" />
            </div>
          </div>

          <div class="field">
            <label for="description">Description</label>
            <textarea id="description" formControlName="description" placeholder="Fermented batter packed for cold storage delivery"></textarea>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="price">Price per unit</label>
              <input id="price" type="number" min="0" formControlName="price" placeholder="120" />
            </div>

            <div class="field">
              <label for="stock">Stock available</label>
              <input id="stock" type="number" min="0" formControlName="stock" placeholder="45" />
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="unit">Unit</label>
              <select id="unit" formControlName="unit">
                @for (unit of units; track unit.value) {
                  <option [value]="unit.value">{{ unit.label }}</option>
                }
              </select>
            </div>

            <div class="field">
              <label for="customUnitLabel">Custom unit label</label>
              <input id="customUnitLabel" type="text" formControlName="customUnitLabel" placeholder="Tray, tub, case" />
            </div>
          </div>

          <div class="field">
            <label>Product image</label>
            <label class="upload-zone" [class.has-preview]="imagePreview()">
              @if (imagePreview()) {
                <img class="upload-preview" [src]="imagePreview()" alt="Preview" />
                <span class="upload-replace">Click to replace</span>
              } @else {
                <div class="upload-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>Click to upload image</span>
                  <small class="muted">JPG, PNG, WebP — max 1 MB</small>
                </div>
              }
              <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onImagePick($event)" hidden />
            </label>
            @if (imageSizeError()) {
              <p class="error-text" style="margin:0">{{ imageSizeError() }}</p>
            }
          </div>

          @if (submitError()) {
            <p class="error-text">{{ submitError() }}</p>
          }

          <button class="btn btn-primary" type="submit" [disabled]="form.invalid">Save product</button>
        </form>

        <div class="panel-grid">
          @if (!sellerProducts().length) {
            <div class="surface-card empty-state">No products yet. Add the first supplier listing to make it visible in the buyer catalog.</div>
          } @else {
            @for (product of sellerProducts(); track product.id) {
              <article class="surface-card seller-card">
                @if (product.imageUrl) {
                  <img class="product-img" [src]="product.imageUrl" [alt]="product.name" />
                }

                <div class="seller-card-top">
                  <div>
                    <h2>{{ product.name }}</h2>
                    <p class="muted">{{ product.category }} · {{ unitLabel(product) }}</p>
                  </div>
                  <span class="status-chip" [class.available]="product.isAvailable" [class.off]="!product.isAvailable">
                    {{ product.isAvailable ? 'Visible' : 'Hidden' }}
                  </span>
                </div>

                <p class="muted">{{ product.description || 'No description added yet.' }}</p>

                <div class="seller-card-meta">
                  <span>{{ product.price | currency:'INR':'symbol':'1.0-2' }} / {{ unitLabel(product) }}</span>
                  <span>{{ product.stock }} in stock</span>
                </div>

                <div class="seller-card-actions">
                  <button class="btn btn-secondary" type="button" (click)="toggleAvailability(product)">
                    {{ product.isAvailable ? 'Hide from catalog' : 'Publish listing' }}
                  </button>
                  <button class="btn btn-secondary danger" type="button" (click)="delete(product.id)">Delete</button>
                </div>
              </article>
            }
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .seller-layout {
        display: grid;
        gap: 1.5rem;
        padding: 2rem 0 3rem;
      }

      .seller-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
      }

      .seller-stats {
        display: flex;
        gap: 1rem;
      }

      .stat-card {
        min-width: 160px;
        padding: 1rem 1.2rem;
        display: grid;
        gap: 0.2rem;
      }

      .stat-card strong {
        font-family: 'Manrope', sans-serif;
        font-size: 2rem;
      }

      .seller-grid {
        display: grid;
        grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.1fr);
        gap: 1.5rem;
      }

      .seller-form,
      .seller-card {
        padding: 1.5rem;
      }

      .seller-card {
        display: grid;
        gap: 1rem;
        overflow: hidden;
      }

      .seller-card h2 {
        margin: 0 0 0.25rem;
        font-family: 'Plus Jakarta Sans', sans-serif;
      }

      .product-img {
        width: calc(100% + 3rem);
        margin: -1.5rem -1.5rem 0;
        height: 180px;
        object-fit: cover;
        display: block;
      }

      /* Upload zone */
      .upload-zone {
        display: block;
        cursor: pointer;
        border: 1.5px dashed var(--line);
        border-radius: var(--radius-md);
        overflow: hidden;
        transition: border-color 150ms ease;
      }

      .upload-zone:hover {
        border-color: var(--brand);
      }

      .upload-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1.75rem 1rem;
        color: var(--text-secondary);
        text-align: center;
        font-size: 0.875rem;
      }

      .upload-preview {
        width: 100%;
        height: 180px;
        object-fit: cover;
        display: block;
      }

      .upload-replace {
        display: block;
        text-align: center;
        padding: 0.4rem;
        font-size: 0.75rem;
        color: var(--text-secondary);
        background: rgba(0,0,0,0.03);
      }

      .seller-card-top,
      .seller-card-meta,
      .seller-card-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .seller-card-actions {
        flex-wrap: wrap;
      }

      .danger {
        color: var(--danger);
      }

      @media (max-width: 960px) {
        .seller-header,
        .seller-card-top,
        .seller-card-meta {
          flex-direction: column;
          align-items: flex-start;
        }

        .seller-grid {
          grid-template-columns: 1fr;
        }
      }
    `
  ]
})
export class SellerProductsPageComponent {
  readonly productService = inject(ProductService);
  private readonly formBuilder = inject(FormBuilder);
  readonly units = unitOptions;
  readonly submitError = signal<string | null>(null);
  readonly sellerProducts = this.productService.sellerProducts;
  readonly activeCount = computed(() => this.sellerProducts().filter((product) => product.isAvailable).length);

  readonly imagePreview = signal<string | null>(null);
  readonly imageSizeError = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    category: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    price: [0, [Validators.required, Validators.min(1)]],
    unit: ['kg' as const, Validators.required],
    customUnitLabel: [''],
    stock: [0, [Validators.required, Validators.min(0)]]
  });

  onImagePick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const maxBytes = 1 * 1024 * 1024;
    if (file.size > maxBytes) {
      this.imageSizeError.set('Image exceeds 1 MB. Please choose a smaller file.');
      this.imagePreview.set(null);
      return;
    }

    this.imageSizeError.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const unit = value.unit as UnitCode;

    if (unit === 'custom' && !value.customUnitLabel.trim()) {
      this.submitError.set('Enter a label for the custom unit.');
      return;
    }

    this.submitError.set(null);

    try {
      await this.productService.createProduct({
        name: value.name.trim(),
        category: value.category.trim(),
        description: value.description.trim() || undefined,
        price: Number(value.price),
        unit,
        customUnitLabel: unit === 'custom' ? value.customUnitLabel.trim() : undefined,
        stock: Number(value.stock),
        imageUrl: this.imagePreview() ?? undefined
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save product.';
      this.submitError.set(message);
      return;
    }

    this.imagePreview.set(null);
    this.imageSizeError.set(null);
    this.form.reset({
      name: '',
      category: '',
      description: '',
      price: 0,
      unit: 'kg',
      customUnitLabel: '',
      stock: 0
    });
  }

  unitLabel(product: Product): string {
    return product.unit === 'custom' ? product.customUnitLabel || 'unit' : product.unit;
  }

  async toggleAvailability(product: Product): Promise<void> {
    await this.productService.updateAvailability(product.id, !product.isAvailable);
  }

  async delete(productId: string): Promise<void> {
    await this.productService.deleteProduct(productId);
  }
}
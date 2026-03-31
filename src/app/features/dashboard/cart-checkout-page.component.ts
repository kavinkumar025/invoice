import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AddressService } from '../../core/data/address.service';
import { CartService } from '../../core/data/cart.service';
import { OrderService } from '../../core/data/order.service';
import { Address } from '../../core/models/commerce.models';

@Component({
  selector: 'app-cart-checkout-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, CurrencyPipe],
  template: `
    <section class="page-section checkout-layout">
      <div class="checkout-main panel-grid">
        <header class="surface-card checkout-hero">
          <div>
            <span class="eyebrow">Cart and COD checkout</span>
            <h1 class="section-title">Review items, manage delivery addresses, and place COD orders</h1>
          </div>
          <a class="pill-link" routerLink="/catalog">Continue shopping</a>
        </header>

        <section class="surface-card checkout-card">
          <div class="checkout-section-head">
            <div>
              <h2 class="section-title">Cart</h2>
              <p class="muted">Cart items are grouped by seller; checkout splits them into seller-specific orders.</p>
            </div>
          </div>

          @if (!cartService.lines().length) {
            <div class="empty-state">Your cart is empty. Add products from the catalog to continue.</div>
          } @else {
            <div class="panel-grid">
              @for (group of cartService.groupedBySeller(); track group.sellerId) {
                <article class="seller-bucket">
                  <div class="bucket-head">
                    <strong>{{ group.sellerName }}</strong>
                    <span>{{ group.totalAmount | currency:'INR':'symbol':'1.0-2' }}</span>
                  </div>

                  @for (line of group.lines; track line.productId) {
                    <div class="cart-line">
                      <div>
                        <strong>{{ line.productName }}</strong>
                        <p class="muted">{{ line.price | currency:'INR':'symbol':'1.0-2' }} / {{ line.unitLabel }}</p>
                      </div>

                      <div class="line-controls">
                        <input type="number" min="1" [value]="line.quantity" (change)="updateQuantity(line.productId, $event)" />
                        <span>{{ line.price * line.quantity | currency:'INR':'symbol':'1.0-2' }}</span>
                        <button class="btn btn-secondary" type="button" (click)="remove(line.productId)">Remove</button>
                      </div>
                    </div>
                  }
                </article>
              }
            </div>
          }
        </section>

        <section class="surface-card checkout-card">
          <div class="checkout-section-head">
            <div>
              <h2 class="section-title">Delivery addresses</h2>
              <p class="muted">Save multiple addresses and mark one as default for COD delivery.</p>
            </div>
          </div>

          @if (addressService.addresses().length) {
            <div class="address-grid">
              @for (address of addressService.addresses(); track address.id) {
                <article class="address-card" [class.selected]="selectedAddressId() === address.id">
                  <div class="address-card-head">
                    <strong>{{ address.label }}</strong>
                    @if (address.isDefault) {
                      <span class="status-chip available">Default</span>
                    }
                  </div>

                  <p class="muted">{{ address.contactName }} · {{ address.phone }}</p>
                  <p class="muted">{{ formatAddress(address) }}</p>

                  <div class="address-actions">
                    <button class="btn btn-secondary" type="button" (click)="selectAddress(address.id)">Use this address</button>
                    @if (!address.isDefault) {
                      <button class="btn btn-secondary" type="button" (click)="setDefault(address.id)">Set default</button>
                    }
                    <button class="btn btn-secondary danger" type="button" (click)="deleteAddress(address.id)">Delete</button>
                  </div>
                </article>
              }
            </div>
          } @else {
            <div class="empty-state">No saved addresses yet. Add one below before placing an order.</div>
          }

          <form class="address-form field-grid" [formGroup]="addressForm" (ngSubmit)="saveAddress()">
            <div class="field-row">
              <div class="field">
                <label for="label">Label</label>
                <input id="label" type="text" formControlName="label" placeholder="Main kitchen" />
              </div>
              <div class="field">
                <label for="contactName">Contact name</label>
                <input id="contactName" type="text" formControlName="contactName" placeholder="Store Manager" />
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="phone">Phone</label>
                <input id="phone" type="tel" formControlName="phone" placeholder="9876543210" />
              </div>
              <div class="field">
                <label for="line1">Address line 1</label>
                <input id="line1" type="text" formControlName="line1" placeholder="Street and building" />
              </div>
            </div>

            <div class="field">
              <label for="line2">Address line 2</label>
              <input id="line2" type="text" formControlName="line2" placeholder="Area, landmark" />
            </div>

            <div class="field-row">
              <div class="field">
                <label for="city">City</label>
                <input id="city" type="text" formControlName="city" placeholder="Chennai" />
              </div>
              <div class="field">
                <label for="state">State</label>
                <input id="state" type="text" formControlName="state" placeholder="Tamil Nadu" />
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="postalCode">Postal code</label>
                <input id="postalCode" type="text" formControlName="postalCode" placeholder="600001" />
              </div>
              <label class="default-toggle">
                <input type="checkbox" formControlName="isDefault" />
                <span>Make this the default address</span>
              </label>
            </div>

            @if (addressError()) {
              <p class="error-text">{{ addressError() }}</p>
            }

            <button class="btn btn-secondary" type="submit">Save address</button>
          </form>
        </section>
      </div>

      <aside class="surface-card checkout-summary">
        <div>
          <span class="eyebrow">COD summary</span>
          <h2 class="section-title">Order total</h2>
        </div>

        <dl>
          <div>
            <dt>Items</dt>
            <dd>{{ cartService.totalItems() }}</dd>
          </div>
          <div>
            <dt>Subtotal</dt>
            <dd>{{ cartService.totalAmount() | currency:'INR':'symbol':'1.0-2' }}</dd>
          </div>
          <div>
            <dt>GST</dt>
            <dd>{{ 0 | currency:'INR':'symbol':'1.0-2' }}</dd>
          </div>
          <div class="summary-total">
            <dt>Total</dt>
            <dd>{{ cartService.totalAmount() | currency:'INR':'symbol':'1.0-2' }}</dd>
          </div>
        </dl>

        <p class="muted">Payment method: Cash on Delivery. Invoice PDFs are generated locally in your browser from the order data.</p>

        @if (checkoutError()) {
          <p class="error-text">{{ checkoutError() }}</p>
        }

        @if (checkoutSuccess()) {
          <p class="status-chip available">{{ checkoutSuccess() }}</p>
        }

        <button class="btn btn-primary" type="button" [disabled]="!cartService.totalItems() || placingOrder()" (click)="checkout()">
          {{ placingOrder() ? 'Placing COD orders...' : 'Place COD order' }}
        </button>
      </aside>
    </section>
  `,
  styles: [
    `
      .checkout-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
        gap: 1.5rem;
        padding: 2rem 0 3rem;
      }

      .checkout-card,
      .checkout-summary,
      .checkout-hero {
        padding: 1.5rem;
      }

      .checkout-main {
        min-width: 0;
      }

      .checkout-section-head,
      .bucket-head,
      .cart-line,
      .address-card-head,
      .address-actions,
      .line-controls,
      .summary-total {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .seller-bucket,
      .address-card {
        padding: 1rem;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid var(--line);
      }

      .address-grid,
      .address-form,
      .seller-bucket {
        display: grid;
        gap: 1rem;
      }

      .address-card.selected {
        border-color: rgba(30, 107, 74, 0.38);
        box-shadow: 0 10px 20px rgba(30, 107, 74, 0.12);
      }

      .default-toggle {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-weight: 700;
      }

      .line-controls input {
        width: 84px;
        padding: 0.7rem;
        border-radius: 12px;
        border: 1px solid var(--line);
      }

      .checkout-summary dl {
        display: grid;
        gap: 0.8rem;
        margin: 1rem 0 1.5rem;
      }

      .checkout-summary dl div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .checkout-summary dt {
        color: var(--text-secondary);
      }

      .checkout-summary dd {
        margin: 0;
        font-weight: 700;
      }

      @media (max-width: 980px) {
        .checkout-layout {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .checkout-section-head,
        .bucket-head,
        .cart-line,
        .address-card-head,
        .address-actions,
        .line-controls,
        .summary-total {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `
  ]
})
export class CartCheckoutPageComponent {
  readonly cartService = inject(CartService);
  readonly addressService = inject(AddressService);
  readonly orderService = inject(OrderService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly selectedAddressId = signal('');
  readonly addressError = signal<string | null>(null);
  readonly checkoutError = signal<string | null>(null);
  readonly checkoutSuccess = signal<string | null>(null);
  readonly placingOrder = signal(false);

  readonly addressForm = this.formBuilder.nonNullable.group({
    label: ['', [Validators.required, Validators.minLength(2)]],
    contactName: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.minLength(8)]],
    line1: ['', [Validators.required, Validators.minLength(4)]],
    line2: [''],
    city: ['', [Validators.required, Validators.minLength(2)]],
    state: ['', [Validators.required, Validators.minLength(2)]],
    postalCode: ['', [Validators.required, Validators.minLength(4)]],
    isDefault: [false]
  });

  constructor() {
    effect(() => {
      const defaultAddress = this.addressService.defaultAddress();
      if (defaultAddress && !this.selectedAddressId()) {
        this.selectedAddressId.set(defaultAddress.id);
      }
    });
  }

  updateQuantity(productId: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.cartService.updateQuantity(productId, value);
  }

  remove(productId: string): void {
    this.cartService.remove(productId);
  }

  selectAddress(addressId: string): void {
    this.selectedAddressId.set(addressId);
    this.checkoutError.set(null);
  }

  async setDefault(addressId: string): Promise<void> {
    await this.addressService.setDefaultAddress(addressId);
    this.selectedAddressId.set(addressId);
  }

  async deleteAddress(addressId: string): Promise<void> {
    await this.addressService.deleteAddress(addressId);
    if (this.selectedAddressId() === addressId) {
      this.selectedAddressId.set(this.addressService.defaultAddress()?.id ?? '');
    }
  }

  async saveAddress(): Promise<void> {
    if (this.addressForm.invalid) {
      this.addressForm.markAllAsTouched();
      return;
    }

    this.addressError.set(null);

    try {
      const addressId = await this.addressService.saveAddress(this.addressForm.getRawValue());
      this.selectedAddressId.set(addressId);
      this.addressForm.reset({
        label: '',
        contactName: '',
        phone: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        isDefault: false
      });
    } catch (error) {
      this.addressError.set(error instanceof Error ? error.message : 'Could not save the address.');
    }
  }

  async checkout(): Promise<void> {
    this.checkoutError.set(null);
    this.checkoutSuccess.set(null);
    this.placingOrder.set(true);

    try {
      const result = await this.orderService.placeCodOrders(this.selectedAddressId());
      this.checkoutSuccess.set(`Created ${result.orderIds.length} COD order(s). Redirecting to orders...`);
      await this.router.navigateByUrl('/buyer/orders');
    } catch (error) {
      this.checkoutError.set(error instanceof Error ? error.message : 'Could not place the order.');
    } finally {
      this.placingOrder.set(false);
    }
  }

  formatAddress(address: Address): string {
    return [address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(', ');
  }
}
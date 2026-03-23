import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OrderService } from '../../core/data/order.service';
import { Order, OrderStatus } from '../../core/models/commerce.models';

@Component({
  selector: 'app-seller-orders-page',
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, TitleCasePipe],
  template: `
    <section class="page-section orders-layout">
      <header class="surface-card orders-header">
        <div>
          <span class="eyebrow">Seller orders</span>
          <h1 class="section-title">Process incoming COD orders and invoices</h1>
        </div>
        <a class="pill-link" routerLink="/seller">Back to product desk</a>
      </header>

      @if (!orderService.sellerOrders().length) {
        <div class="surface-card empty-state">No orders assigned to this seller yet.</div>
      } @else {
        <div class="panel-grid">
          @for (order of orderService.sellerOrders(); track order.id) {
            <article class="surface-card order-card">
              <div class="order-top">
                <div>
                  <h2>{{ order.buyerBusinessName || order.buyerName }}</h2>
                  <p class="muted">Order {{ order.id }} · {{ order.createdAt | date:'medium' }}</p>
                </div>
                <span class="status-chip" [class.available]="order.status === 'delivered' || order.status === 'confirmed'" [class.low]="order.status === 'pending'" [class.off]="order.status === 'cancelled'">
                  {{ order.status | titlecase }}
                </span>
              </div>

              <div class="line-list">
                @for (line of order.products; track line.productId) {
                  <div class="line-row">
                    <span>{{ line.productName }} × {{ line.quantity }}</span>
                    <span>{{ line.price * line.quantity | currency:'INR':'symbol':'1.0-2' }}</span>
                  </div>
                }
              </div>

              <div class="address-box muted">
                Deliver to: {{ order.shippingAddress.contactName }}, {{ order.shippingAddress.phone }} ·
                {{ formatAddress(order) }}
              </div>

              <div class="order-actions">
                @for (status of nextStatuses(order.status); track status) {
                  <button class="btn btn-secondary" type="button" (click)="updateStatus(order.id, status)">{{ status | titlecase }}</button>
                }

                @if (order.invoiceUrl) {
                  <a class="pill-link" [href]="order.invoiceUrl" target="_blank" rel="noopener">Invoice PDF</a>
                }

                <button class="btn btn-secondary" type="button" (click)="generateInvoice(order.id)">Regenerate invoice</button>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .orders-layout {
        display: grid;
        gap: 1.5rem;
        padding: 2rem 0 3rem;
      }

      .orders-header,
      .order-card {
        padding: 1.5rem;
      }

      .orders-header,
      .order-top,
      .line-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .order-card,
      .line-list {
        display: grid;
        gap: 1rem;
      }

      .order-card h2 {
        margin: 0 0 0.3rem;
        font-family: 'Manrope', sans-serif;
      }

      .order-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .address-box {
        padding: 1rem;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid var(--line);
      }

      @media (max-width: 720px) {
        .orders-header,
        .order-top,
        .line-row {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `
  ]
})
export class SellerOrdersPageComponent {
  readonly orderService = inject(OrderService);

  nextStatuses(current: OrderStatus): OrderStatus[] {
    const flow: Record<OrderStatus, OrderStatus[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: []
    };

    return flow[current];
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<void> {
    await this.orderService.updateOrderStatus(orderId, status);
  }

  async generateInvoice(orderId: string): Promise<void> {
    await this.orderService.generateInvoice(orderId);
  }

  formatAddress(order: Order): string {
    return [
      order.shippingAddress.line1,
      order.shippingAddress.line2,
      order.shippingAddress.city,
      order.shippingAddress.state,
      order.shippingAddress.postalCode
    ]
      .filter(Boolean)
      .join(', ');
  }
}
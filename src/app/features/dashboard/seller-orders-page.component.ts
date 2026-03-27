import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
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
                    <div class="line-main">
                      @if (line.imageUrl) {
                        <img class="line-image" [src]="line.imageUrl" [alt]="line.productName" />
                      }
                      <div>
                        <strong>{{ line.productName }}</strong>
                        <p class="muted">{{ line.quantity }} × {{ line.unitLabel }} · {{ line.price | currency:'INR':'symbol':'1.0-2' }} each</p>
                      </div>
                    </div>
                    <span>{{ line.price * line.quantity | currency:'INR':'symbol':'1.0-2' }}</span>
                  </div>
                }
              </div>

              <div class="order-detail-grid">
                <div class="detail-box">
                  <span class="muted">Buyer</span>
                  <strong>{{ order.buyerBusinessName || order.buyerName }}</strong>
                </div>
                <div class="detail-box">
                  <span class="muted">Buyer contact</span>
                  <strong>{{ order.buyerPhone || order.buyerEmail }}</strong>
                </div>
                <div class="detail-box">
                  <span class="muted">Invoice</span>
                  <strong>{{ order.invoiceNumber || 'Not generated yet' }}</strong>
                </div>
                <div class="detail-box">
                  <span class="muted">Payment</span>
                  <strong>{{ order.paymentType | titlecase }}</strong>
                </div>
                <div class="detail-box detail-box-wide">
                  <span class="muted">Deliver to</span>
                  <strong>{{ order.shippingAddress.contactName }}, {{ order.shippingAddress.phone }} · {{ formatAddress(order) }}</strong>
                </div>
              </div>

              <div class="order-actions">
                @for (status of nextStatuses(order.status); track status) {
                  <button class="btn btn-secondary" type="button" (click)="updateStatus(order.id, status)">{{ status | titlecase }}</button>
                }

                @if (order.invoiceNumber) {
                  <span class="pill-link">{{ order.invoiceNumber }}</span>
                }

                <button class="btn btn-secondary" type="button" [disabled]="busyOrderId() === order.id" (click)="downloadInvoice(order.id)">
                  {{ busyOrderId() === order.id ? 'Preparing PDF...' : (order.invoiceUrl ? 'Download invoice PDF' : 'Generate and download PDF') }}
                </button>
              </div>

              @if (actionError() && busyOrderId() === null) {
                <p class="error-text">{{ actionError() }}</p>
              }
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

      .line-main {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .line-image {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        object-fit: cover;
        border: 1px solid var(--line);
      }

      .order-detail-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.85rem;
      }

      .detail-box {
        padding: 0.9rem 1rem;
        border-radius: var(--radius-md);
        background: var(--surface-2);
        border: 1px solid var(--line);
        display: grid;
        gap: 0.3rem;
      }

      .detail-box strong {
        font-family: 'Plus Jakarta Sans', sans-serif;
      }

      .detail-box-wide {
        grid-column: span 2;
      }

      .order-card h2 {
        margin: 0 0 0.3rem;
        font-family: 'Plus Jakarta Sans', sans-serif;
      }

      .order-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .line-row strong {
        font-family: 'Plus Jakarta Sans', sans-serif;
      }

      @media (max-width: 720px) {
        .orders-header,
        .order-top,
        .line-row {
          flex-direction: column;
          align-items: flex-start;
        }

        .order-detail-grid {
          grid-template-columns: 1fr;
        }

        .detail-box-wide {
          grid-column: auto;
        }
      }
    `
  ]
})
export class SellerOrdersPageComponent {
  readonly orderService = inject(OrderService);
  readonly busyOrderId = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

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

  async downloadInvoice(orderId: string): Promise<void> {
    const order = this.orderService.sellerOrders().find((item) => item.id === orderId);

    if (!order) {
      this.actionError.set('Order not found for invoice download.');
      return;
    }

    this.busyOrderId.set(orderId);
    this.actionError.set(null);

    try {
      await this.orderService.downloadInvoicePdf(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not download the invoice PDF.';
      this.actionError.set(message);
    } finally {
      this.busyOrderId.set(null);
    }
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
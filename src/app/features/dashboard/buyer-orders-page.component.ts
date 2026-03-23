import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OrderService } from '../../core/data/order.service';

@Component({
  selector: 'app-buyer-orders-page',
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, TitleCasePipe],
  template: `
    <section class="page-section orders-layout">
      <header class="surface-card orders-header">
        <div>
          <span class="eyebrow">Buyer orders</span>
          <h1 class="section-title">Track COD orders and invoice PDFs</h1>
        </div>
        <a class="pill-link" routerLink="/catalog">Back to catalog</a>
      </header>

      @if (!orderService.buyerOrders().length) {
        <div class="surface-card empty-state">No buyer orders yet. Once checkout completes, orders and invoice links appear here.</div>
      } @else {
        <div class="panel-grid">
          @for (order of orderService.buyerOrders(); track order.id) {
            <article class="surface-card order-card">
              <div class="order-top">
                <div>
                  <h2>Order {{ order.id }}</h2>
                  <p class="muted">{{ order.sellerName }} · {{ order.createdAt | date:'medium' }}</p>
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

              <div class="order-meta">
                <span>Total: {{ order.totalAmount | currency:'INR':'symbol':'1.0-2' }}</span>
                @if (order.invoiceUrl) {
                  <a class="pill-link" [href]="order.invoiceUrl" target="_blank" rel="noopener">Download invoice</a>
                } @else {
                  <button class="btn btn-secondary" type="button" (click)="generateInvoice(order.id)">Generate invoice</button>
                }
              </div>

              @if (invoiceMessage() === order.id) {
                <p class="muted">Invoice requested. Refresh in a moment if the link does not appear immediately.</p>
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
      .order-meta,
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

      @media (max-width: 720px) {
        .orders-header,
        .order-top,
        .order-meta,
        .line-row {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `
  ]
})
export class BuyerOrdersPageComponent {
  readonly orderService = inject(OrderService);
  readonly invoiceMessage = signal<string | null>(null);

  async generateInvoice(orderId: string): Promise<void> {
    await this.orderService.generateInvoice(orderId);
    this.invoiceMessage.set(orderId);
  }
}
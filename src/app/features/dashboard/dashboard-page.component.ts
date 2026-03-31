import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Chart as ChartType } from 'chart.js';

import { AuthService } from '../../core/auth/auth.service';
import { AddressService } from '../../core/data/address.service';
import { CartService } from '../../core/data/cart.service';
import { OrderService } from '../../core/data/order.service';
import { ProductService } from '../../core/data/product.service';
import { Order } from '../../core/models/commerce.models';

let chartModule: typeof import('chart.js') | null = null;

async function loadChart(): Promise<typeof import('chart.js')> {
  if (!chartModule) {
    chartModule = await import('chart.js');
    chartModule.Chart.register(...chartModule.registerables);
  }
  return chartModule;
}

interface DashboardStat {
  label: string;
  value: number;
  helper: string;
  format?: 'currency';
  tone?: 'accent';
}

interface DashboardAction {
  label: string;
  route: string;
  style: 'primary' | 'secondary';
  description?: string;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [CommonModule, RouterLink, CurrencyPipe, DatePipe, TitleCasePipe],
  template: `
    <section class="page-section dashboard-layout">
      <header class="surface-card dashboard-hero">
        <div class="hero-copy">
          <span class="eyebrow">Operations dashboard</span>
          <h1 class="section-title">{{ heroTitle() }}</h1>
          <p class="muted">{{ heroSummary() }}</p>

          <div class="cta-row">
            @for (action of heroActions(); track action.route) {
              <a
                class="btn"
                [class.btn-primary]="action.style === 'primary'"
                [class.btn-secondary]="action.style === 'secondary'"
                [routerLink]="action.route"
              >
                {{ action.label }}
              </a>
            }
          </div>
        </div>

        <aside class="hero-aside">
          <span class="hero-kicker">{{ roleHeadline() }}</span>
          <strong>{{ profileName() }}</strong>
          <p class="muted">{{ heroAsideCopy() }}</p>

          <div class="hero-meta">
            <div>
              <span>Member since</span>
              <strong>{{ authService.profile()?.createdAt | date:'MMMM y' }}</strong>
            </div>
            <div>
              <span>{{ roleMetaLabel() }}</span>
              <strong>{{ roleMetaValue() }}</strong>
            </div>
          </div>
        </aside>
      </header>

      <section class="dashboard-stats">
        @for (stat of stats(); track stat.label) {
          <article class="surface-card stat-card" [class.accent-card]="stat.tone === 'accent'">
            <span>{{ stat.label }}</span>
            <strong>
              @if (stat.format === 'currency') {
                {{ stat.value | currency:'INR':'symbol':'1.0-2' }}
              } @else {
                {{ stat.value }}
              }
            </strong>
            <small class="muted">{{ stat.helper }}</small>
          </article>
        }
      </section>

      <section class="charts-grid">
        <article class="surface-card chart-card">
          <div class="card-head">
            <div>
              <span class="eyebrow">Trend</span>
              <h2 class="section-title">{{ isSeller() ? 'Monthly Revenue' : 'Monthly Spending' }}</h2>
            </div>
          </div>
          <div class="chart-wrap"><canvas #monthlyBarCanvas></canvas></div>
        </article>

        <article class="surface-card chart-card">
          <div class="card-head">
            <div>
              <span class="eyebrow">Breakdown</span>
              <h2 class="section-title">Order Status</h2>
            </div>
          </div>
          <div class="chart-wrap chart-wrap-pie"><canvas #statusPieCanvas></canvas></div>
        </article>

        <article class="surface-card chart-card">
          <div class="card-head">
            <div>
              <span class="eyebrow">{{ isSeller() ? 'Products' : 'Sellers' }}</span>
              <h2 class="section-title">{{ isSeller() ? 'Top Products by Revenue' : 'Spend by Seller' }}</h2>
            </div>
          </div>
          <div class="chart-wrap"><canvas #topItemsBarCanvas></canvas></div>
        </article>

        <article class="surface-card chart-card">
          <div class="card-head">
            <div>
              <span class="eyebrow">{{ isSeller() ? 'Inventory' : 'Activity' }}</span>
              <h2 class="section-title">{{ isSeller() ? 'Stock Levels' : 'Orders per Seller' }}</h2>
            </div>
          </div>
          <div class="chart-wrap chart-wrap-pie"><canvas #secondaryCanvas></canvas></div>
        </article>
      </section>

      <div class="dashboard-grid">
        <section class="surface-card workspace-card">
          <div class="card-head">
            <div>
              <span class="eyebrow">Workspace links</span>
              <h2 class="section-title">Move between screens</h2>
            </div>
          </div>

          <div class="action-grid">
            @for (action of workspaceActions(); track action.route) {
              <a class="action-card" [class.action-card-primary]="action.style === 'primary'" [routerLink]="action.route">
                <strong>{{ action.label }}</strong>
                <p class="muted">{{ action.description }}</p>
              </a>
            }
          </div>
        </section>

        <section class="surface-card insight-card">
          @if (isSeller()) {
            <div class="card-head">
              <div>
                <span class="eyebrow">Inventory focus</span>
                <h2 class="section-title">Keep listings healthy</h2>
              </div>
            </div>

            <div class="insight-list">
              <div class="insight-row">
                <span>Low stock products</span>
                <strong>{{ lowStockProducts() }}</strong>
              </div>
              <div class="insight-row">
                <span>Hidden or empty listings</span>
                <strong>{{ hiddenListings() }}</strong>
              </div>
              <div class="insight-row">
                <span>Total products</span>
                <strong>{{ productService.sellerProducts().length }}</strong>
              </div>
            </div>

            <a class="pill-link" routerLink="/seller">Review seller desk</a>
          } @else {
            <div class="card-head">
              <div>
                <span class="eyebrow">Delivery readiness</span>
                <h2 class="section-title">Default shipping address</h2>
              </div>
            </div>

            @if (addressService.defaultAddress(); as address) {
              <div class="address-card">
                <strong>{{ address.label }}</strong>
                <p class="muted">{{ address.contactName }} · {{ address.phone }}</p>
                <p>{{ address.line1 }}</p>
                @if (address.line2) {
                  <p>{{ address.line2 }}</p>
                }
                <p>{{ address.city }}, {{ address.state }} {{ address.postalCode }}</p>
              </div>
            } @else {
              <div class="empty-note">No address saved yet. Add one before checkout so the cart can move straight into COD order placement.</div>
            }

            <a class="pill-link" routerLink="/account">Manage addresses</a>
          }
        </section>
      </div>

      <section class="surface-card activity-card">
        <div class="card-head">
          <div>
            <span class="eyebrow">Recent activity</span>
            <h2 class="section-title">{{ activityHeading() }}</h2>
          </div>
          <a class="pill-link" [routerLink]="ordersRoute()">{{ ordersActionLabel() }}</a>
        </div>

        @if (!recentOrders().length) {
          <div class="empty-note">{{ emptyActivityCopy() }}</div>
        } @else {
          <div class="activity-list">
            @for (order of recentOrders(); track order.id) {
              <article class="activity-row">
                <div>
                  <strong>{{ counterpartyName(order) }}</strong>
                  <p class="muted">Order {{ shortOrderId(order.id) }} · {{ order.createdAt | date:'mediumDate' }}</p>
                </div>
                <div class="activity-meta">
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
    </section>
  `,
  styles: [
    `
      .dashboard-layout {
        display: grid;
        gap: 1.25rem;
        padding: 2rem 0 4rem;
      }

      .dashboard-hero {
        display: grid;
        gap: 1.5rem;
        grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
        padding: 1.5rem;
        background: linear-gradient(135deg, rgb(22 163 74 / 0.1), rgb(255 255 255 / 0.98));
      }

      .hero-copy {
        display: grid;
        gap: 1rem;
        align-content: start;
      }

      .hero-copy p {
        margin: 0;
        line-height: 1.7;
        max-width: 60ch;
      }

      .hero-aside {
        display: grid;
        gap: 0.85rem;
        align-content: start;
        padding: 1.25rem;
        border-radius: var(--radius-lg);
        border: 1px solid rgb(22 163 74 / 0.14);
        background: rgb(255 255 255 / 0.82);
      }

      .hero-kicker {
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--brand-dark);
      }

      .hero-aside strong {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.15rem;
      }

      .hero-aside p {
        margin: 0;
        line-height: 1.65;
      }

      .hero-meta {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .hero-meta div {
        display: grid;
        gap: 0.3rem;
        padding: 0.9rem;
        border-radius: var(--radius-md);
        background: var(--surface);
        border: 1px solid var(--line);
      }

      .hero-meta span {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text-secondary);
      }

      .hero-meta strong {
        font-size: 0.95rem;
      }

      .dashboard-stats {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .stat-card {
        display: grid;
        gap: 0.35rem;
        padding: 1.25rem;
      }

      .stat-card span {
        font-size: 0.82rem;
        color: var(--text-secondary);
      }

      .stat-card strong {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.7rem;
        letter-spacing: -0.03em;
      }

      .accent-card {
        background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
        border-color: rgb(22 163 74 / 0.24);
      }

      .dashboard-grid {
        display: grid;
        gap: 1.25rem;
        grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
      }

      .charts-grid {
        display: grid;
        gap: 1.25rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .chart-card {
        display: grid;
        gap: 1rem;
        padding: 1.5rem;
      }

      .chart-wrap {
        position: relative;
        width: 100%;
        height: 260px;
      }

      .chart-wrap-pie {
        height: 280px;
        max-width: 340px;
        margin: 0 auto;
      }

      .workspace-card,
      .insight-card,
      .activity-card {
        display: grid;
        gap: 1.25rem;
        padding: 1.5rem;
      }

      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 1rem;
      }

      .action-grid {
        display: grid;
        gap: 0.9rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .action-card {
        display: grid;
        gap: 0.55rem;
        padding: 1rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--line);
        background: var(--surface);
        transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
      }

      .action-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
        border-color: #cbd5e1;
      }

      .action-card-primary {
        background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
        border-color: rgb(22 163 74 / 0.22);
      }

      .action-card strong {
        font-size: 0.95rem;
      }

      .action-card p {
        margin: 0;
        font-size: 0.87rem;
        line-height: 1.55;
      }

      .insight-list {
        display: grid;
        gap: 0.8rem;
      }

      .insight-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 0.9rem 1rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--line);
        background: var(--surface-2);
      }

      .insight-row span {
        font-size: 0.88rem;
        color: var(--text-secondary);
      }

      .address-card {
        display: grid;
        gap: 0.35rem;
        padding: 1rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--line);
        background: var(--surface-2);
      }

      .address-card p {
        margin: 0;
        font-size: 0.9rem;
      }

      .empty-note {
        padding: 1rem;
        border-radius: var(--radius-md);
        border: 1px dashed #cbd5e1;
        background: #ffffff;
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1.6;
      }

      .activity-list {
        display: grid;
        gap: 0.85rem;
      }

      .activity-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--line);
      }

      .activity-row:first-child {
        padding-top: 0;
        border-top: 0;
      }

      .activity-row p {
        margin: 0.25rem 0 0;
        font-size: 0.85rem;
      }

      .activity-meta {
        display: grid;
        gap: 0.45rem;
        justify-items: end;
        text-align: right;
      }

      .activity-meta strong {
        font-size: 1rem;
      }

      @media (max-width: 900px) {
        .dashboard-hero,
        .dashboard-grid {
          grid-template-columns: 1fr;
        }

        .dashboard-stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .charts-grid {
          grid-template-columns: 1fr;
        }

        .action-grid {
          grid-template-columns: 1fr;
        }

        .activity-row {
          flex-direction: column;
          align-items: start;
        }

        .activity-meta {
          justify-items: start;
          text-align: left;
        }
      }

      @media (max-width: 640px) {
        .dashboard-layout {
          padding-top: 1.25rem;
        }

        .hero-meta,
        .dashboard-stats {
          grid-template-columns: 1fr;
        }

        .dashboard-hero,
        .workspace-card,
        .insight-card,
        .activity-card {
          padding: 1.25rem;
        }
      }
    `
  ]
})
export class DashboardPageComponent implements AfterViewInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly addressService = inject(AddressService);
  readonly cartService = inject(CartService);
  readonly orderService = inject(OrderService);
  readonly productService = inject(ProductService);

  private readonly monthlyBarCanvas = viewChild<ElementRef<HTMLCanvasElement>>('monthlyBarCanvas');
  private readonly statusPieCanvas = viewChild<ElementRef<HTMLCanvasElement>>('statusPieCanvas');
  private readonly topItemsBarCanvas = viewChild<ElementRef<HTMLCanvasElement>>('topItemsBarCanvas');
  private readonly secondaryCanvas = viewChild<ElementRef<HTMLCanvasElement>>('secondaryCanvas');

  private monthlyChart: ChartType | null = null;
  private statusChart: ChartType | null = null;
  private topItemsChart: ChartType | null = null;
  private secondaryChart: ChartType | null = null;
  private chartsReady = false;

  readonly isBuyer = computed(() => this.authService.role() === 'buyer');
  readonly isSeller = computed(() => this.authService.role() === 'seller');
  readonly profileName = computed(() => this.authService.profile()?.businessName || this.authService.profile()?.name || 'there');

  readonly totalBuyerSpend = computed(() =>
    this.orderService.buyerOrders().reduce((sum, order) => sum + order.totalAmount, 0)
  );

  readonly buyerActiveOrders = computed(() =>
    this.orderService.buyerOrders().filter((order) => order.status === 'pending' || order.status === 'confirmed').length
  );

  readonly sellerPendingOrders = computed(() =>
    this.orderService.sellerOrders().filter((order) => order.status === 'pending').length
  );

  readonly sellerGrossSales = computed(() =>
    this.orderService.sellerOrders().reduce((sum, order) => sum + order.totalAmount, 0)
  );

  readonly sellerLiveListings = computed(() =>
    this.productService.sellerProducts().filter((product) => product.isAvailable && product.stock > 0).length
  );

  readonly sellerUnitsInStock = computed(() =>
    this.productService.sellerProducts().reduce((sum, product) => sum + product.stock, 0)
  );

  readonly lowStockProducts = computed(() =>
    this.productService.sellerProducts().filter((product) => product.stock > 0 && product.stock <= 10).length
  );

  readonly hiddenListings = computed(() =>
    this.productService.sellerProducts().filter((product) => !product.isAvailable || product.stock === 0).length
  );

  readonly heroTitle = computed(() =>
    this.isSeller() ? `Seller dashboard for ${this.profileName()}` : `Buyer dashboard for ${this.profileName()}`
  );

  readonly heroSummary = computed(() => {
    if (this.isSeller()) {
      return 'Use this screen as the seller starting point for orders, listings, account updates, and revenue tracking.';
    }

    return 'Use this screen as the buyer starting point for orders, checkout, delivery readiness, and account updates.';
  });

  readonly roleHeadline = computed(() => (this.isSeller() ? 'Seller command center' : 'Buyer control room'));

  readonly heroAsideCopy = computed(() => {
    if (this.isSeller()) {
      return 'Check inventory pressure and new orders here before jumping into the seller desk.';
    }

    return 'Check order flow and shipping readiness here before jumping into cart or buyer workspace.';
  });

  readonly roleMetaLabel = computed(() => (this.isSeller() ? 'Live listings' : 'Saved addresses'));

  readonly roleMetaValue = computed(() =>
    this.isSeller() ? String(this.sellerLiveListings()) : String(this.addressService.addresses().length)
  );

  readonly stats = computed<DashboardStat[]>(() => {
    if (this.isSeller()) {
      return [
        { label: 'Gross sales', value: this.sellerGrossSales(), helper: 'Across all seller orders', format: 'currency', tone: 'accent' },
        { label: 'Pending orders', value: this.sellerPendingOrders(), helper: 'Need action from seller' },
        { label: 'Live listings', value: this.sellerLiveListings(), helper: 'Available to buyers right now' },
        { label: 'Units in stock', value: this.sellerUnitsInStock(), helper: 'Across all seller products' }
      ];
    }

    return [
      { label: 'Total spend', value: this.totalBuyerSpend(), helper: 'Across all completed buyer activity', format: 'currency', tone: 'accent' },
      { label: 'Active orders', value: this.buyerActiveOrders(), helper: 'Pending or confirmed orders' },
      { label: 'Cart items', value: this.cartService.totalItems(), helper: 'Ready for checkout' },
      { label: 'Saved addresses', value: this.addressService.addresses().length, helper: 'Delivery destinations on file' }
    ];
  });

  readonly heroActions = computed<DashboardAction[]>(() => {
    if (this.isSeller()) {
      return [
        { label: 'Open seller desk', route: '/seller', style: 'primary' },
        { label: 'View seller orders', route: '/seller/orders', style: 'secondary' },
        { label: 'Open account', route: '/account', style: 'secondary' }
      ];
    }

    return [
      { label: 'Open buyer hub', route: '/buyer', style: 'primary' },
      { label: 'View buyer orders', route: '/buyer/orders', style: 'secondary' },
      { label: 'Open cart', route: '/cart', style: 'secondary' }
    ];
  });

  readonly workspaceActions = computed<DashboardAction[]>(() => {
    if (this.isSeller()) {
      return [
        { label: 'Seller desk', route: '/seller', style: 'primary', description: 'Manage products, pricing, stock, and listing availability.' },
        { label: 'Seller orders', route: '/seller/orders', style: 'secondary', description: 'Confirm, deliver, or cancel incoming orders.' },
        { label: 'My account', route: '/account', style: 'secondary', description: 'Update your contact and business profile details.' },
        { label: 'Catalog', route: '/catalog', style: 'secondary', description: 'Review the live marketplace as buyers see it.' }
      ];
    }

    return [
      { label: 'Buyer hub', route: '/buyer', style: 'primary', description: 'Open the buyer workspace with spend and order summaries.' },
      { label: 'Buyer orders', route: '/buyer/orders', style: 'secondary', description: 'Track order status and invoice availability.' },
      { label: 'Cart and checkout', route: '/cart', style: 'secondary', description: 'Finish grouped COD checkout across sellers.' },
      { label: 'My account', route: '/account', style: 'secondary', description: 'Keep your profile and delivery details current.' }
    ];
  });

  readonly recentOrders = computed(() =>
    this.isSeller() ? this.orderService.sellerOrders().slice(0, 4) : this.orderService.buyerOrders().slice(0, 4)
  );

  readonly activityHeading = computed(() => (this.isSeller() ? 'Latest incoming orders' : 'Latest buyer orders'));
  readonly ordersRoute = computed(() => (this.isSeller() ? '/seller/orders' : '/buyer/orders'));
  readonly ordersActionLabel = computed(() => (this.isSeller() ? 'Open seller orders' : 'Open buyer orders'));

  readonly emptyActivityCopy = computed(() => {
    if (this.isSeller()) {
      return 'No seller orders yet. Keep products live in the seller desk so buyers can start placing COD orders.';
    }

    return 'No buyer orders yet. Browse the catalog and place an order to populate this dashboard.';
  });

  counterpartyName(order: Order): string {
    return this.isSeller() ? order.buyerBusinessName || order.buyerName : order.sellerName;
  }

  shortOrderId(orderId: string): string {
    return orderId.slice(-6).toUpperCase();
  }

  ngAfterViewInit(): void {
    this.chartsReady = true;
    this.buildCharts();
  }

  ngOnDestroy(): void {
    this.monthlyChart?.destroy();
    this.statusChart?.destroy();
    this.topItemsChart?.destroy();
    this.secondaryChart?.destroy();
  }

  constructor() {
    effect(() => {
      const _ = this.isSeller() ? this.orderService.sellerOrders() : this.orderService.buyerOrders();
      const __ = this.productService.sellerProducts();
      if (this.chartsReady) {
        this.buildCharts();
      }
    });
  }

  private async buildCharts(): Promise<void> {
    const { Chart } = await loadChart();
    const orders = this.isSeller() ? this.orderService.sellerOrders() : this.orderService.buyerOrders();
    this.renderMonthlyBar(Chart, orders);
    this.renderStatusPie(Chart, orders);
    this.renderTopItemsBar(Chart, orders);
    this.renderSecondaryChart(Chart, orders);
  }

  private renderMonthlyBar(Chart: typeof ChartType, orders: Order[]): void {
    const canvas = this.monthlyBarCanvas()?.nativeElement;
    if (!canvas) return;
    this.monthlyChart?.destroy();

    const months = this.lastNMonthLabels(6);
    const amounts = months.map((m) =>
      orders
        .filter((o) => this.orderMonthKey(o) === m.key)
        .reduce((s, o) => s + o.totalAmount, 0)
    );

    this.monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map((m) => m.label),
        datasets: [{
          label: this.isSeller() ? 'Revenue' : 'Spend',
          data: amounts,
          backgroundColor: 'rgba(22,163,74,0.7)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => `Rs.${v}` } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  private renderStatusPie(Chart: typeof ChartType, orders: Order[]): void {
    const canvas = this.statusPieCanvas()?.nativeElement;
    if (!canvas) return;
    this.statusChart?.destroy();

    const statuses: Order['status'][] = ['pending', 'confirmed', 'delivered', 'cancelled'];
    const counts = statuses.map((s) => orders.filter((o) => o.status === s).length);
    const colors = ['#f59e0b', '#3b82f6', '#16a34a', '#ef4444'];

    this.statusChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: statuses.map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
        datasets: [{ data: counts, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 16 } } }
      }
    });
  }

  private renderTopItemsBar(Chart: typeof ChartType, orders: Order[]): void {
    const canvas = this.topItemsBarCanvas()?.nativeElement;
    if (!canvas) return;
    this.topItemsChart?.destroy();

    if (this.isSeller()) {
      const productMap = new Map<string, number>();
      for (const order of orders) {
        for (const line of order.products) {
          productMap.set(line.productName, (productMap.get(line.productName) || 0) + line.price * line.quantity);
        }
      }
      const sorted = [...productMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      this.topItemsChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: sorted.map((e) => e[0]),
          datasets: [{ label: 'Revenue', data: sorted.map((e) => e[1]), backgroundColor: '#6366f1', borderRadius: 6, borderSkipped: false }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { callback: (v) => `Rs.${v}` } }, y: { grid: { display: false } } }
        }
      });
    } else {
      const sellerMap = new Map<string, number>();
      for (const order of orders) {
        sellerMap.set(order.sellerName, (sellerMap.get(order.sellerName) || 0) + order.totalAmount);
      }
      const sorted = [...sellerMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const barColors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];
      this.topItemsChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: sorted.map((e) => e[0]),
          datasets: [{ label: 'Spend', data: sorted.map((e) => e[1]), backgroundColor: barColors.slice(0, sorted.length), borderRadius: 6, borderSkipped: false }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { callback: (v) => `Rs.${v}` } }, y: { grid: { display: false } } }
        }
      });
    }
  }

  private renderSecondaryChart(Chart: typeof ChartType, orders: Order[]): void {
    const canvas = this.secondaryCanvas()?.nativeElement;
    if (!canvas) return;
    this.secondaryChart?.destroy();

    if (this.isSeller()) {
      const products = this.productService.sellerProducts().slice(0, 8);
      const colors = ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#059669', '#10b981', '#34d399', '#6ee7b7'];
      this.secondaryChart = new Chart(canvas, {
        type: 'pie',
        data: {
          labels: products.map((p) => p.name),
          datasets: [{ data: products.map((p) => p.stock), backgroundColor: colors.slice(0, products.length), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { padding: 12 } } }
        }
      });
    } else {
      const sellerMap = new Map<string, number>();
      for (const order of orders) {
        sellerMap.set(order.sellerName, (sellerMap.get(order.sellerName) || 0) + 1);
      }
      const entries = [...sellerMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const colors = ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#6366f1'];
      this.secondaryChart = new Chart(canvas, {
        type: 'pie',
        data: {
          labels: entries.map((e) => e[0]),
          datasets: [{ data: entries.map((e) => e[1]), backgroundColor: colors.slice(0, entries.length), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { padding: 12 } } }
        }
      });
    }
  }

  private lastNMonthLabels(n: number): { key: string; label: string }[] {
    const result: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
      result.push({ key, label });
    }
    return result;
  }

  private orderMonthKey(order: Order): string {
    const d = new Date(order.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth/auth.service';
import { CartService } from '../core/data/cart.service';

@Component({
  selector: 'app-shell',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-shell">
      <header class="page-section shell-header">
        <a class="brand-mark" routerLink="/">
          <span class="brand-kicker">Cold chain commerce</span>
          <strong>InvoiceHub B2B</strong>
        </a>

        <nav class="shell-nav">
          <a routerLink="/catalog" routerLinkActive="active-link">Catalog</a>

          @if (authService.role() === 'seller') {
            <a routerLink="/seller" routerLinkActive="active-link">Seller desk</a>
            <a routerLink="/seller/orders" routerLinkActive="active-link">Orders</a>
          }

          @if (authService.role() === 'buyer') {
            <a routerLink="/buyer" routerLinkActive="active-link">Buyer hub</a>
            <a routerLink="/buyer/orders" routerLinkActive="active-link">Orders</a>
            <a routerLink="/cart" routerLinkActive="active-link">Cart ({{ cartService.totalItems() }})</a>
          }
        </nav>

        <div class="shell-actions">
          @if (authService.profile(); as profile) {
            <div class="user-pill">
              <span>{{ profile.businessName || profile.name }}</span>
              <small>{{ roleLabel() }}</small>
            </div>
            <button class="btn btn-secondary" type="button" (click)="logout()">Sign out</button>
          } @else {
            <a class="pill-link" routerLink="/login">Sign in</a>
            <a class="btn btn-primary" routerLink="/register">Create account</a>
          }
        </div>
      </header>

      <router-outlet />
    </div>
  `,
  styles: [
    `
      .shell-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1.2rem 0 0;
      }

      .brand-mark {
        display: grid;
        gap: 0.2rem;
      }

      .brand-mark strong {
        font-family: 'Manrope', sans-serif;
        font-size: 1.1rem;
      }

      .brand-kicker {
        color: var(--text-secondary);
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .shell-nav,
      .shell-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .shell-nav a {
        padding: 0.7rem 0.95rem;
        border-radius: 999px;
        color: var(--text-secondary);
      }

      .shell-nav a.active-link,
      .shell-nav a:hover {
        background: rgba(255, 255, 255, 0.85);
        color: var(--text-primary);
      }

      .user-pill {
        display: grid;
        gap: 0.1rem;
        padding: 0.8rem 1rem;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid var(--line);
      }

      .user-pill span {
        font-weight: 700;
      }

      .user-pill small {
        color: var(--text-secondary);
      }

      @media (max-width: 900px) {
        .shell-header {
          flex-direction: column;
          align-items: stretch;
        }

        .shell-nav,
        .shell-actions {
          flex-wrap: wrap;
          justify-content: center;
        }
      }
    `
  ]
})
export class ShellComponent {
  readonly authService = inject(AuthService);
  readonly cartService = inject(CartService);
  readonly roleLabel = computed(() => (this.authService.role() === 'seller' ? 'Seller admin' : 'Buyer account'));

  async logout(): Promise<void> {
    await this.authService.logout();
  }
}
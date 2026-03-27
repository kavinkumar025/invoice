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
      <div class="nav-bar">
        <header class="page-section shell-header">
          <a class="brand-mark" routerLink="/">
            <div class="brand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div class="brand-text">
              <span class="brand-name">InvoiceHub B2B</span>
              <small class="brand-kicker">Cold Chain Commerce</small>
            </div>
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
              <a routerLink="/cart" routerLinkActive="active-link">
                Cart
                @if (cartService.totalItems() > 0) {
                  <span class="cart-count">{{ cartService.totalItems() }}</span>
                }
              </a>
            }

            @if (authService.profile()) {
              <a routerLink="/account" routerLinkActive="active-link">My account</a>
            }
          </nav>

          <div class="shell-actions">
            @if (authService.profile(); as profile) {
              <div class="user-pill">
                <div class="user-avatar">{{ initials(profile.businessName || profile.name) }}</div>
                <div class="user-info">
                  <span>{{ profile.businessName || profile.name }}</span>
                  <small>{{ roleLabel() }}</small>
                </div>
              </div>
              <button class="btn btn-secondary" type="button" (click)="logout()">Sign out</button>
            } @else {
              <a class="pill-link" routerLink="/login">Sign in</a>
              <a class="btn btn-primary" routerLink="/register">Create account</a>
            }
          </div>
        </header>
      </div>

      <router-outlet />
    </div>
  `,
  styles: [
    `
      .nav-bar {
        position: sticky;
        top: 0;
        z-index: 100;
        background: rgba(255, 255, 255, 0.97);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--line);
      }

      .shell-header {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        height: 62px;
      }

      /* Brand */
      .brand-mark {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        flex-shrink: 0;
        text-decoration: none;
      }

      .brand-icon {
        width: 32px;
        height: 32px;
        background: var(--brand);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
      }

      .brand-text {
        display: grid;
        line-height: 1.2;
      }

      .brand-name {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      .brand-kicker {
        font-size: 0.68rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }

      /* Nav */
      .shell-nav {
        display: flex;
        align-items: center;
        gap: 0.125rem;
        flex: 1;
      }

      .shell-nav a {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.75rem;
        border-radius: var(--radius-sm);
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--text-secondary);
        transition: color 150ms ease, background 150ms ease;
      }

      .shell-nav a:hover {
        color: var(--text-primary);
        background: var(--surface-2);
      }

      .shell-nav a.active-link {
        color: var(--brand-dark);
        background: var(--brand-light);
        font-weight: 600;
      }

      .cart-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        background: var(--brand);
        color: white;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
      }

      /* Actions */
      .shell-actions {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        margin-left: auto;
      }

      .user-pill {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.375rem 0.75rem 0.375rem 0.375rem;
        border-radius: 999px;
        background: var(--surface-2);
        border: 1px solid var(--line);
      }

      .user-avatar {
        width: 28px;
        height: 28px;
        background: var(--brand-light);
        color: var(--brand-dark);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        font-weight: 700;
        flex-shrink: 0;
      }

      .user-info {
        display: grid;
        gap: 0.05rem;
        line-height: 1.2;
      }

      .user-info span {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .user-info small {
        font-size: 0.7rem;
        color: var(--text-secondary);
      }

      @media (max-width: 900px) {
        .shell-header {
          flex-wrap: wrap;
          height: auto;
          padding: 0.75rem 0;
          gap: 0.75rem;
        }

        .shell-nav {
          flex-wrap: wrap;
          order: 3;
          flex-basis: 100%;
        }

        .shell-actions {
          margin-left: 0;
        }
      }
    `
  ]
})
export class ShellComponent {
  readonly authService = inject(AuthService);
  readonly cartService = inject(CartService);
  readonly roleLabel = computed(() => (this.authService.role() === 'seller' ? 'Seller admin' : 'Buyer account'));

  initials(name: string): string {
    return (name || '?')
      .split(' ')
      .filter((w) => w.length > 0)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  async logout(): Promise<void> {
    await this.authService.logout();
  }
}
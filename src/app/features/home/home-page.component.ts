import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-page',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="home-wrap">

      <!-- Hero -->
      <section class="page-section hero-section">
        <div class="hero-content">
          <span class="eyebrow">B2B Cold Chain Commerce</span>
          <h1 class="page-title">
            Manage perishable inventory
            <span class="hero-accent">without the chaos.</span>
          </h1>
          <p class="muted hero-sub">
            A complete B2B trade platform for suppliers and buyers of idli batter, seafood, meat, and chilled goods. Real-time catalog, orders, and invoices — all in one place.
          </p>
          <div class="cta-row">
            <a class="btn btn-primary hero-btn" routerLink="/register">Get started free</a>
            <a class="btn btn-secondary hero-btn" routerLink="/catalog">Browse catalog</a>
          </div>
          <div class="trust-badges">
            <span class="trust-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              Firebase Auth
            </span>
            <span class="trust-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              Realtime sync
            </span>
            <span class="trust-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              Multi-seller ready
            </span>
          </div>
        </div>
      </section>

      <!-- Features -->
      <section class="page-section features-section">
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon fi-blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3>Role-based auth</h3>
            <p class="muted">Seller and buyer accounts with Firebase. Each role gets a dedicated workspace the moment they sign in.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon fi-green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.657-4.03 3-9 3S3 13.657 3 12"/>
                <path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
              </svg>
            </div>
            <h3>Realtime database</h3>
            <p class="muted">User profiles and live product catalog in Firebase Realtime Database. All changes reflect instantly across sessions.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon fi-orange">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            </div>
            <h3>Commerce model</h3>
            <p class="muted">Products, orders, invoices, and units fully typed. Purpose-built for cold-chain perishable supply chains.</p>
          </div>
        </div>
      </section>

    </div>
  `,
  styles: [
    `
      .home-wrap {
        padding-bottom: 5rem;
      }

      /* Hero */
      .hero-section {
        padding: 5rem 0 3.5rem;
        text-align: center;
      }

      .hero-content {
        max-width: 680px;
        margin: 0 auto;
        display: grid;
        gap: 1.75rem;
      }

      .hero-accent {
        display: block;
        color: var(--brand);
      }

      .hero-sub {
        font-size: 1.05rem;
        line-height: 1.75;
        max-width: 54ch;
        margin: 0 auto;
      }

      .cta-row {
        justify-content: center;
      }

      .hero-btn {
        padding: 0.75rem 1.75rem;
        font-size: 0.95rem;
      }

      .trust-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        justify-content: center;
      }

      .trust-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.4rem 0.875rem;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--line);
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--text-secondary);
      }

      .trust-badge svg {
        color: var(--brand);
        flex-shrink: 0;
      }

      /* Features */
      .features-section {
        padding-bottom: 2rem;
      }

      .features-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem;
      }

      .feature-card {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        padding: 1.75rem;
        box-shadow: var(--shadow-md);
        display: grid;
        gap: 0.75rem;
        align-content: start;
        transition: box-shadow 200ms ease, transform 200ms ease;
      }

      .feature-card:hover {
        box-shadow: var(--shadow-lg);
        transform: translateY(-3px);
      }

      .feature-card h3 {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1rem;
        font-weight: 700;
        margin: 0;
        color: var(--text-primary);
      }

      .feature-card p {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.65;
      }

      .feature-icon {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .fi-blue  { background: #eff6ff; color: #3b82f6; }
      .fi-green { background: var(--brand-light); color: var(--brand-dark); }
      .fi-orange { background: #fff7ed; color: #ea580c; }

      @media (max-width: 720px) {
        .features-grid {
          grid-template-columns: 1fr;
        }

        .hero-section {
          padding-top: 3rem;
          padding-bottom: 2.5rem;
        }
      }
    `
  ]
})
export class HomePageComponent {}
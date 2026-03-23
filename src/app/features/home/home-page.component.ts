import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-page',
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-section hero-layout">
      <article class="hero-copy">
        <span class="eyebrow">B2B frozen and perishable goods</span>
        <h1 class="page-title">Sell idli batter, seafood, meat, and chilled inventory without spreadsheet chaos.</h1>
        <p class="muted hero-text">
          This Angular application now boots with Firebase Authentication and Realtime Database so suppliers and buyers can move into a real catalog and order workflow.
        </p>

        <div class="cta-row">
          <a class="btn btn-primary" routerLink="/register">Create seller or buyer account</a>
          <a class="btn btn-secondary" routerLink="/catalog">Browse live catalog</a>
        </div>

        <div class="hero-pills">
          <span class="pill-link">Email/password auth</span>
          <span class="pill-link">Realtime Database sync</span>
          <span class="pill-link">Multi-seller ready model</span>
        </div>
      </article>

      <aside class="surface-card hero-panel">
        <div>
          <p class="panel-label">Implemented in this pass</p>
          <h2 class="section-title">Foundation for catalog, seller workspace, and buyer accounts</h2>
        </div>

        <div class="hero-stats">
          <div>
            <strong>Auth</strong>
            <p class="muted">Seller and buyer registration, login, role-aware redirects</p>
          </div>
          <div>
            <strong>Database</strong>
            <p class="muted">Realtime user profiles and live product catalog</p>
          </div>
          <div>
            <strong>Commerce model</strong>
            <p class="muted">Products, orders, invoices, and units typed for later expansion</p>
          </div>
        </div>
      </aside>
    </section>
  `,
  styles: [
    `
      .hero-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.9fr);
        gap: 1.5rem;
        padding: 3rem 0 2rem;
      }

      .hero-copy,
      .hero-panel {
        padding: 2rem;
        border-radius: var(--radius-xl);
      }

      .hero-copy {
        background: linear-gradient(145deg, rgba(255, 252, 246, 0.96) 0%, rgba(255, 244, 221, 0.85) 100%);
        border: 1px solid rgba(255, 255, 255, 0.9);
        box-shadow: var(--shadow-lg);
      }

      .hero-text {
        max-width: 58ch;
        font-size: 1.05rem;
        margin: 1.2rem 0 1.6rem;
      }

      .hero-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 1.6rem;
      }

      .panel-label {
        margin: 0 0 0.75rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.8rem;
      }

      .hero-stats {
        display: grid;
        gap: 1rem;
        margin-top: 2rem;
      }

      .hero-stats div {
        padding: 1rem;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.68);
        border: 1px solid rgba(36, 53, 38, 0.08);
      }

      .hero-stats strong {
        font-family: 'Manrope', sans-serif;
        font-size: 1.05rem;
      }

      .hero-stats p {
        margin: 0.35rem 0 0;
      }

      @media (max-width: 900px) {
        .hero-layout {
          grid-template-columns: 1fr;
          padding-top: 2rem;
        }
      }
    `
  ]
})
export class HomePageComponent {}
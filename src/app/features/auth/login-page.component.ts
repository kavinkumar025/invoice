import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page-section auth-layout">
      <article class="surface-card auth-copy">
        <span class="eyebrow">Account access</span>
        <h1 class="section-title">Sign in to your chilled inventory workspace</h1>
        <p class="muted">
          Sellers land in the product desk. Buyers land in the purchasing hub. Authentication is handled by Firebase email/password.
        </p>
      </article>

      <form class="surface-card auth-form field-grid" [formGroup]="form" (ngSubmit)="submit()">
        <div>
          <h2 class="section-title">Sign in</h2>
          <p class="muted">Use the email and password registered for your business account.</p>
        </div>

        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" formControlName="email" placeholder="procurement@hotel.com" />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" formControlName="password" placeholder="Enter your password" />
        </div>

        @if (authService.errorMessage()) {
          <p class="error-text">{{ authService.errorMessage() }}</p>
        }

        <button class="btn btn-primary" type="submit" [disabled]="form.invalid || authService.busy()">
          {{ authService.busy() ? 'Signing in...' : 'Sign in' }}
        </button>

        <p class="muted auth-footer">
          Need a new account?
          <a routerLink="/register">Register here</a>
        </p>
      </form>
    </section>
  `,
  styles: [
    `
      .auth-layout {
        display: grid;
        grid-template-columns: minmax(0, 0.95fr) minmax(360px, 0.8fr);
        gap: 1.5rem;
        padding: 2rem 0 3rem;
      }

      .auth-copy,
      .auth-form {
        padding: 2rem;
      }

      .auth-footer a {
        color: var(--brand-dark);
        font-weight: 700;
      }

      @media (max-width: 860px) {
        .auth-layout {
          grid-template-columns: 1fr;
        }
      }
    `
  ]
})
export class LoginPageComponent {
  readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();

    try {
      await this.authService.login(email, password);
    } catch {
      return;
    }
  }
}
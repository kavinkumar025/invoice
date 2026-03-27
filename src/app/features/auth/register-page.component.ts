import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models/commerce.models';

@Component({
  selector: 'app-register-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page-section auth-layout">
      <article class="surface-card auth-copy">
        <span class="eyebrow">Business onboarding</span>
        <h1 class="section-title">Create a buyer or seller account</h1>
        <p class="muted">
          Registration writes the user profile to Firebase Realtime Database immediately after Authentication succeeds.
        </p>
      </article>

      <form class="surface-card auth-form field-grid" [formGroup]="form" (ngSubmit)="submit()">
        <div>
          <h2 class="section-title">Register</h2>
          <p class="muted">Use seller for suppliers and buyer for hotels, retailers, or supermarkets.</p>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="name">Full name</label>
            <input id="name" type="text" formControlName="name" placeholder="Priya Narayanan" />
          </div>

          <div class="field">
            <label for="businessName">Business name</label>
            <input id="businessName" type="text" formControlName="businessName" placeholder="FreshCatch Foods" />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" formControlName="email" placeholder="sales@supplier.com" />
          </div>

          <div class="field">
            <label for="phone">Phone</label>
            <input id="phone" type="tel" formControlName="phone" placeholder="9876543210" />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="role">Role</label>
            <select id="role" formControlName="role">
              <option value="seller">Seller</option>
              <option value="buyer">Buyer</option>
            </select>
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input id="password" type="password" formControlName="password" placeholder="Minimum 6 characters" />
          </div>
        </div>

        @if (requiresBusinessName()) {
          <p class="muted">Seller accounts use the business name on catalog cards and invoice headers.</p>
        }

        @if (authService.errorMessage()) {
          <p class="error-text">{{ authService.errorMessage() }}</p>
        }

        <button class="btn btn-primary" type="submit" [disabled]="form.invalid || authService.busy()">
          {{ authService.busy() ? 'Creating account...' : 'Create account' }}
        </button>

        <p class="muted auth-footer">
          Already have an account?
          <a routerLink="/login">Sign in</a>
        </p>
      </form>
    </section>
  `,
  styles: [
    `
      .auth-layout {
        display: grid;
        grid-template-columns: minmax(0, 0.85fr) minmax(380px, 1fr);
        gap: 1.5rem;
        padding: 2.5rem 0 4rem;
        align-items: start;
      }

      .auth-copy {
        padding: 2.5rem;
        background: linear-gradient(145deg, #0d4023 0%, var(--brand) 60%, #22c55e 100%);
        color: white;
        min-height: 420px;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        border: none;
      }

      .auth-copy .eyebrow {
        background: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.9);
      }

      .auth-copy .section-title {
        color: white;
      }

      .auth-copy .muted {
        color: rgba(255, 255, 255, 0.72);
        line-height: 1.7;
      }

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

        .auth-copy {
          min-height: auto;
        }
      }
    `
  ]
})
export class RegisterPageComponent {
  readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    businessName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    role: ['seller' as UserRole, Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly requiresBusinessName = computed(() => this.form.controls.role.value === 'seller');

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const businessName = value.businessName.trim() || undefined;

    try {
      await this.authService.register({
        name: value.name.trim(),
        businessName,
        email: value.email.trim(),
        phone: value.phone.trim() || undefined,
        role: value.role,
        password: value.password
      });
    } catch {
      return;
    }
  }
}
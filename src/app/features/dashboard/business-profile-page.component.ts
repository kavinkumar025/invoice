import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';

import { AuthService } from '../../core/auth/auth.service';
import { BusinessProfileService } from '../../core/data/business-profile.service';
import { ExpenseCategory, expenseCategoryOptions } from '../../core/models/commerce.models';

Chart.register(...registerables);

type PeriodFilter = 'week' | 'month' | 'quarter' | 'year' | 'all';
type DashboardRange = 'daily' | 'weekly' | 'monthly';

interface DeleteConfirmation {
  type: 'investment' | 'expense' | 'loan';
  id: string;
  label: string;
  amount: number;
}

interface ComparisonMetric {
  label: string;
  current: number;
  previous: number;
  unit: 'currency' | 'count' | 'percent';
}

const CATEGORY_COLORS: Record<string, string> = {
  salary: '#3b82f6',
  raw_material: '#f59e0b',
  rent_utilities: '#8b5cf6',
  marketing: '#ec4899',
  transport: '#14b8a6',
  insurance: '#6366f1',
  equipment: '#f97316',
  miscellaneous: '#94a3b8'
};

@Component({
  selector: 'app-business-profile-page',
  imports: [CommonModule, FormsModule, RouterLink, CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <section class="page-section bp-layout">
      <!-- Delete Confirmation Modal -->
      @if (deleteConfirm()) {
        <div class="modal-overlay" (click)="cancelDelete()">
          <div class="modal-card surface-card" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h3 class="section-title">Confirm Deletion</h3>
              <button class="btn-icon-remove" type="button" (click)="cancelDelete()">✕</button>
            </div>
            <div class="modal-body">
              <p>Are you sure you want to delete this {{ deleteConfirm()!.type }}?</p>
              <div class="modal-detail">
                <strong>{{ deleteConfirm()!.label }}</strong>
                <span class="amount-tag">{{ deleteConfirm()!.amount | currency:'INR':'symbol':'1.0-2' }}</span>
              </div>
              <p class="muted">This action cannot be undone.</p>
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" type="button" (click)="cancelDelete()">Cancel</button>
              <button class="btn btn-danger" type="button" (click)="confirmDelete()" [disabled]="deleteInProgress()">
                {{ deleteInProgress() ? 'Deleting...' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Hero -->
      <header class="surface-card bp-hero">
        <div>
          <span class="eyebrow">Financial overview</span>
          <h1 class="section-title">Personal Finance</h1>
          <p class="muted">Track investments, expenses, loans, EMI payments, and calculate how long your business can sustain.</p>
        </div>
        <div class="cta-row">
          <a class="btn btn-secondary" [routerLink]="homeLink()">Back to workspace</a>
          <button class="btn btn-primary" type="button" (click)="downloadPdf()" [disabled]="pdfLoading()">
            @if (pdfLoading()) { <span class="btn-spinner"></span> Generating... } @else { Download PDF }
          </button>
          <button class="btn btn-secondary" type="button" (click)="downloadExcel()" [disabled]="excelLoading()">
            @if (excelLoading()) { <span class="btn-spinner"></span> Generating... } @else { Download Excel }
          </button>
        </div>
      </header>

      <!-- Summary Metrics -->
      <section class="surface-card bp-metrics">
        <div class="metric-grid">
          <article class="metric-card">
            <strong>{{ bps.totalInvestment() | currency:'INR':'symbol':'1.0-2' }}</strong>
            <span>Total Investment</span>
          </article>
          <article class="metric-card">
            <strong>{{ bps.monthlyBurn() | currency:'INR':'symbol':'1.0-2' }}</strong>
            <span>Monthly Burn</span>
          </article>
          <article class="metric-card">
            <strong>{{ bps.revenue() | currency:'INR':'symbol':'1.0-2' }}</strong>
            <span>Revenue</span>
          </article>
          <article class="metric-card">
            <strong>{{ bps.loans().length }}</strong>
            <span>Active Loans</span>
          </article>
          <article class="metric-card">
            <strong>{{ bps.currentBalance() | currency:'INR':'symbol':'1.0-2' }}</strong>
            <span>Current Balance</span>
          </article>
          <article class="metric-card runway-card" [class.runway-green]="runwayStatus() === 'green'" [class.runway-yellow]="runwayStatus() === 'yellow'" [class.runway-red]="runwayStatus() === 'red'">
            <strong>{{ runwayLabel() }}</strong>
            <span>Runway</span>
          </article>
        </div>
      </section>

      <!-- Filter Bar -->
      <section class="surface-card bp-filter-bar">
        <div class="filter-bar-row">
          <div class="filter-tabs">
            @for (p of periods; track p.value) {
              <button class="filter-tab" [class.active]="selectedPeriod() === p.value" type="button" (click)="selectedPeriod.set(p.value)">{{ p.label }}</button>
            }
          </div>
          <div class="dashboard-range-group">
            <label class="range-label muted">Dashboard view:</label>
            <select class="range-select" [ngModel]="dashboardRange()" (ngModelChange)="dashboardRange.set($event)">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <span class="filter-range-label muted">{{ filterRangeLabel() }}</span>
        </div>
      </section>

      <!-- Comparison Section -->
      <section class="surface-card bp-comparison">
        <div class="comparison-head">
          <div class="comparison-title-group">
            <span class="eyebrow">{{ comparisonTitle() }}</span>
            <h2 class="section-title">Period Comparison</h2>
            <p class="comparison-subtitle">Compare cash flow, transactions, and loan pressure against the previous period.</p>
          </div>
          <span class="comparison-badge" [class.positive]="comparisonOverallChange() <= 0" [class.negative]="comparisonOverallChange() > 0">
            {{ comparisonOverallChange() > 0 ? '+' : '' }}{{ comparisonOverallChange() | number:'1.1-1' }}% burn change
          </span>
        </div>
        <div class="comparison-grid">
          @for (m of comparisonMetrics(); track m.label) {
            <div class="comparison-card">
              <span class="comparison-card-label">{{ m.label }}</span>
              <div class="comparison-row">
                <div class="comparison-col">
                  <span class="comparison-period-label muted">{{ comparisonCurrentLabel() }}</span>
                  <strong class="comparison-value">
                    @if (m.unit === 'currency') { {{ m.current | currency:'INR':'symbol':'1.0-0' }} }
                    @else { {{ m.current }} }
                  </strong>
                </div>
                <div class="comparison-divider"></div>
                <div class="comparison-col">
                  <span class="comparison-period-label muted">{{ comparisonPreviousLabel() }}</span>
                  <strong class="comparison-value faded">
                    @if (m.unit === 'currency') { {{ m.previous | currency:'INR':'symbol':'1.0-0' }} }
                    @else { {{ m.previous }} }
                  </strong>
                </div>
              </div>
              <div class="comparison-change-bar">
                @if (m.previous > 0) {
                  <span class="comparison-change" [class.positive]="changePercent(m) <= 0" [class.negative]="changePercent(m) > 0">
                    {{ changePercent(m) > 0 ? '↑' : changePercent(m) < 0 ? '↓' : '→' }} {{ absChangePercent(m) | number:'1.0-1' }}%
                  </span>
                } @else {
                  <span class="comparison-change neutral">No prior baseline</span>
                }
              </div>
            </div>
          }
        </div>
        @if (comparisonHighlights().length) {
          <div class="comparison-highlights">
            <div class="comparison-highlights-head">
              <span class="eyebrow">Key highlights</span>
              <span class="comparison-highlights-meta muted">{{ comparisonCurrentLabel() }} vs {{ comparisonPreviousLabel() }}</span>
            </div>
            <ul class="highlight-list">
              @for (h of comparisonHighlights(); track h) {
                <li>{{ h }}</li>
              }
            </ul>
          </div>
        }
      </section>

      <!-- Charts -->
      <section class="bp-charts-row">
        <div class="surface-card bp-chart-panel">
          <div class="chart-head">
            <div>
              <span class="eyebrow">Expenses by category</span>
              <h3 class="section-title">Expense Breakdown</h3>
            </div>
            <span class="chart-total">{{ filteredExpenseTotal() | currency:'INR':'symbol':'1.0-0' }}</span>
          </div>
          <div class="chart-wrap chart-wrap-pie">
            @if (pieChartData().length === 0) {
              <div class="empty-state">No expenses in this period.</div>
            }
            <canvas #pieCanvas [style.display]="pieChartData().length === 0 ? 'none' : 'block'"></canvas>
          </div>
          @if (pieChartData().length > 0) {
            <div class="chart-legend">
              @for (item of pieChartData(); track item.value) {
                <div class="chart-legend-item">
                  <span class="chart-legend-dot" [style.background]="categoryColor(item.value)"></span>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.total | currency:'INR':'symbol':'1.0-0' }}</strong>
                </div>
              }
            </div>
          }
        </div>
        <div class="surface-card bp-chart-panel">
          <div class="chart-head">
            <div>
              <span class="eyebrow">Monthly trends</span>
              <h3 class="section-title">Income vs Expenses</h3>
            </div>
          </div>
          <div class="chart-wrap">
            @if (barChartData().length === 0) {
              <div class="empty-state">No data available.</div>
            }
            <canvas #barCanvas [style.display]="barChartData().length === 0 ? 'none' : 'block'"></canvas>
          </div>
        </div>
      </section>

      <!-- Weekly Insights -->
      <section class="surface-card bp-insights">
        <div class="insights-head">
          <div>
            <span class="eyebrow">Current week</span>
            <h2 class="section-title">Weekly Insights</h2>
          </div>
          <span class="insights-date-range muted">{{ weekRangeLabel() }}</span>
        </div>
        <div class="insights-grid">
          <div class="insight-card">
            <span class="insight-label">Expenses this week</span>
            <strong class="insight-value">{{ insights().thisWeekExpenses | currency:'INR':'symbol':'1.0-0' }}</strong>
            <span class="insight-sub" [class.trend-up]="insights().weekOverWeekChange > 0" [class.trend-down]="insights().weekOverWeekChange < 0">
              @if (insights().weekOverWeekChange !== 0) {
                {{ insights().weekOverWeekChange > 0 ? '+' : '' }}{{ insights().weekOverWeekChange | number:'1.0-1' }}% vs last week
              } @else {
                Same as last week
              }
            </span>
          </div>
          <div class="insight-card">
            <span class="insight-label">Investments received</span>
            <strong class="insight-value">{{ insights().thisWeekInvestments | currency:'INR':'symbol':'1.0-0' }}</strong>
            <span class="insight-sub">{{ insights().investmentCount }} new entr{{ insights().investmentCount === 1 ? 'y' : 'ies' }}</span>
          </div>
          <div class="insight-card">
            <span class="insight-label">Daily burn rate</span>
            <strong class="insight-value">{{ insights().dailyBurn | currency:'INR':'symbol':'1.0-0' }}</strong>
            <span class="insight-sub">{{ insights().weeklyBurn | currency:'INR':'symbol':'1.0-0' }} / week</span>
          </div>
          <div class="insight-card">
            <span class="insight-label">Monthly EMI outflow</span>
            <strong class="insight-value">{{ insights().monthlyEmi | currency:'INR':'symbol':'1.0-0' }}</strong>
            <span class="insight-sub">{{ bps.loans().length }} active loan{{ bps.loans().length === 1 ? '' : 's' }}</span>
          </div>
          <div class="insight-card">
            <span class="insight-label">Net cash flow (week)</span>
            <strong class="insight-value" [class.text-positive]="insights().netCashFlow >= 0" [class.text-negative]="insights().netCashFlow < 0">
              {{ insights().netCashFlow | currency:'INR':'symbol':'1.0-0' }}
            </strong>
            <span class="insight-sub">Investments − Expenses</span>
          </div>
          <div class="insight-card">
            <span class="insight-label">Projected month-end balance</span>
            <strong class="insight-value" [class.text-positive]="insights().projectedMonthEndBalance >= 0" [class.text-negative]="insights().projectedMonthEndBalance < 0">
              {{ insights().projectedMonthEndBalance | currency:'INR':'symbol':'1.0-0' }}
            </strong>
            <span class="insight-sub">{{ insights().daysLeftInMonth }} day{{ insights().daysLeftInMonth === 1 ? '' : 's' }} left in month</span>
          </div>
          <div class="insight-card">
            <span class="insight-label">Expense entries</span>
            <strong class="insight-value">{{ insights().expenseCount }}</strong>
            <span class="insight-sub">Transactions this week</span>
          </div>
          <div class="insight-card">
            <span class="insight-label">Burn-to-revenue ratio</span>
            <strong class="insight-value">{{ insights().burnToRevenueRatio | number:'1.0-1' }}%</strong>
            <span class="insight-sub">Savings rate: {{ insights().savingsRate | number:'1.0-1' }}%</span>
          </div>
        </div>
        @if (insights().topCategory) {
          <div class="top-category-banner">
            <span>Top spending this week</span>
            <strong>{{ insights().topCategory!.label }} · {{ insights().topCategory!.amount | currency:'INR':'symbol':'1.0-0' }}</strong>
          </div>
        }
        @if (insights().categoriesThisWeek.length > 1) {
          <div class="insights-breakdown">
            <span class="insight-label">Category breakdown this week</span>
            <div class="insights-cat-list">
              @for (cat of insights().categoriesThisWeek; track cat.label) {
                <div class="insights-cat-row">
                  <span class="insights-cat-name">{{ cat.label }}</span>
                  <div class="insights-cat-bar-wrap">
                    <div class="insights-cat-bar" [style.width.%]="insights().thisWeekExpenses > 0 ? (cat.total / insights().thisWeekExpenses * 100) : 0"></div>
                  </div>
                  <strong>{{ cat.total | currency:'INR':'symbol':'1.0-0' }}</strong>
                </div>
              }
            </div>
          </div>
        }
      </section>

      <!-- Runway Analysis -->
      <section class="surface-card bp-runway-analysis">
        <div class="runway-banner" [class.runway-green]="runwayStatus() === 'green'" [class.runway-yellow]="runwayStatus() === 'yellow'" [class.runway-red]="runwayStatus() === 'red'">
          <div class="runway-indicator"></div>
          <div>
            <h2 class="section-title">Runway Analysis</h2>
            <p>{{ runwayDescription() }}</p>
          </div>
        </div>
      </section>

      <div class="bp-grid">
        <!-- Investments -->
        <section class="surface-card bp-panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">Capital</span>
              <h2 class="section-title">Investments</h2>
            </div>
            <button class="pill-link" type="button" (click)="showInvestmentForm.set(!showInvestmentForm())">
              {{ showInvestmentForm() ? 'Cancel' : '+ Add' }}
            </button>
          </div>

          @if (showInvestmentForm()) {
            <div class="inline-form field-grid">
              <div class="field-row">
                <div class="field">
                  <label for="invName">Investor name</label>
                  <input id="invName" type="text" [(ngModel)]="invName" placeholder="Investor name" />
                </div>
                <div class="field">
                  <label for="invAmount">Amount (INR)</label>
                  <input id="invAmount" type="number" [(ngModel)]="invAmount" placeholder="0" min="0" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label for="invDate">Date</label>
                  <input id="invDate" type="date" [(ngModel)]="invDate" />
                </div>
                <div class="field">
                  <label for="invNotes">Notes</label>
                  <input id="invNotes" type="text" [(ngModel)]="invNotes" placeholder="Optional notes" />
                </div>
              </div>
              @if (invError()) { <p class="error-text">{{ invError() }}</p> }
              <button class="btn btn-primary" type="button" (click)="addInvestment()" [disabled]="invSaving()">
                @if (invSaving()) { <span class="btn-spinner"></span> } {{ invSaving() ? 'Saving...' : 'Save investment' }}
              </button>
            </div>
          }

          @if (!bps.investments().length) {
            <div class="empty-state">No investments recorded yet.</div>
          } @else {
            <div class="detail-stack">
              @for (inv of bps.investments(); track inv.id) {
                <div class="detail-row">
                  <div>
                    <strong>{{ inv.investorName }}</strong>
                    <p class="muted">{{ inv.date | date:'mediumDate' }}@if(inv.notes) { · {{ inv.notes }} }</p>
                  </div>
                  <div class="detail-row-actions">
                    <span class="amount-tag">{{ inv.amount | currency:'INR':'symbol':'1.0-2' }}</span>
                    <button class="btn-icon-remove" type="button" (click)="removeInvestment(inv.id)" title="Remove">✕</button>
                  </div>
                </div>
              }
            </div>
          }
        </section>

        <!-- Expenses -->
        <section class="surface-card bp-panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">Operations</span>
              <h2 class="section-title">Expenses</h2>
            </div>
            <button class="pill-link" type="button" (click)="showExpenseForm.set(!showExpenseForm())">
              {{ showExpenseForm() ? 'Cancel' : '+ Add' }}
            </button>
          </div>

          @if (showExpenseForm()) {
            <div class="inline-form field-grid">
              <div class="field-row">
                <div class="field">
                  <label for="expLabel">Description</label>
                  <input id="expLabel" type="text" [(ngModel)]="expLabel" placeholder="Expense description" />
                </div>
                <div class="field">
                  <label for="expCategory">Category</label>
                  <select id="expCategory" [(ngModel)]="expCategory">
                    @for (cat of categoryOptions; track cat.value) {
                      <option [value]="cat.value">{{ cat.label }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label for="expAmount">Amount (INR)</label>
                  <input id="expAmount" type="number" [(ngModel)]="expAmount" placeholder="0" min="0" />
                </div>
                <div class="field">
                  <label for="expDate">Date</label>
                  <input id="expDate" type="date" [(ngModel)]="expDate" />
                </div>
              </div>
              <label class="checkbox-row">
                <input type="checkbox" [(ngModel)]="expRecurring" />
                <span>Recurring monthly expense</span>
              </label>
              @if (expError()) { <p class="error-text">{{ expError() }}</p> }
              <button class="btn btn-primary" type="button" (click)="addExpense()" [disabled]="expSaving()">
                @if (expSaving()) { <span class="btn-spinner"></span> } {{ expSaving() ? 'Saving...' : 'Save expense' }}
              </button>
            </div>
          }

          @if (bps.expensesByCategory().length) {
            <div class="category-breakdown">
              @for (cat of bps.expensesByCategory(); track cat.value) {
                <div class="category-chip">
                  <span>{{ cat.label }}</span>
                  <strong>{{ cat.total | currency:'INR':'symbol':'1.0-2' }}</strong>
                </div>
              }
            </div>
          }

          @if (!bps.expenses().length) {
            <div class="empty-state">No expenses recorded yet.</div>
          } @else {
            <div class="detail-stack">
              @for (exp of bps.expenses(); track exp.id) {
                <div class="detail-row">
                  <div>
                    <strong>{{ exp.label }}</strong>
                    <p class="muted">{{ exp.date | date:'mediumDate' }} · {{ categoryLabel(exp.category) }}@if (exp.recurring) { · Recurring }</p>
                  </div>
                  <div class="detail-row-actions">
                    <span class="amount-tag">{{ exp.amount | currency:'INR':'symbol':'1.0-2' }}</span>
                    <button class="btn-icon-remove" type="button" (click)="removeExpense(exp.id)" title="Remove">✕</button>
                  </div>
                </div>
              }
            </div>
          }
        </section>

        <!-- Loans & EMI -->
        <section class="surface-card bp-panel bp-panel-full">
          <div class="panel-head">
            <div>
              <span class="eyebrow">Liabilities</span>
              <h2 class="section-title">Loans &amp; EMI</h2>
            </div>
            <button class="pill-link" type="button" (click)="showLoanForm.set(!showLoanForm())">
              {{ showLoanForm() ? 'Cancel' : '+ Add' }}
            </button>
          </div>

          @if (showLoanForm()) {
            <div class="inline-form field-grid">
              <div class="field-row">
                <div class="field">
                  <label for="loanLender">Lender</label>
                  <input id="loanLender" type="text" [(ngModel)]="loanLender" placeholder="Bank / lender name" />
                </div>
                <div class="field">
                  <label for="loanPrincipal">Principal (INR)</label>
                  <input id="loanPrincipal" type="number" [(ngModel)]="loanPrincipal" placeholder="0" min="0" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label for="loanRate">Interest rate (%)</label>
                  <input id="loanRate" type="number" [(ngModel)]="loanRate" placeholder="0" min="0" step="0.1" />
                </div>
                <div class="field">
                  <label for="loanTenure">Tenure (months)</label>
                  <input id="loanTenure" type="number" [(ngModel)]="loanTenure" placeholder="0" min="0" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label for="loanEmi">EMI amount (INR)</label>
                  <input id="loanEmi" type="number" [(ngModel)]="loanEmi" placeholder="0" min="0" />
                </div>
                <div class="field">
                  <label for="loanStart">Start date</label>
                  <input id="loanStart" type="date" [(ngModel)]="loanStart" />
                </div>
              </div>
              <div class="field">
                <label for="loanNotes">Notes</label>
                <input id="loanNotes" type="text" [(ngModel)]="loanNotes" placeholder="Optional notes" />
              </div>
              @if (loanError()) { <p class="error-text">{{ loanError() }}</p> }
              <button class="btn btn-primary" type="button" (click)="addLoan()" [disabled]="loanSaving()">
                @if (loanSaving()) { <span class="btn-spinner"></span> } {{ loanSaving() ? 'Saving...' : 'Save loan' }}
              </button>
            </div>
          }

          @if (!bps.loans().length) {
            <div class="empty-state">No loans recorded yet.</div>
          } @else {
            <div class="detail-stack">
              @for (loan of bps.loans(); track loan.id) {
                <div class="detail-row loan-row">
                  <div>
                    <strong>{{ loan.lender }}</strong>
                    <p class="muted">
                      Principal: {{ loan.principalAmount | currency:'INR':'symbol':'1.0-2' }}
                      · {{ loan.interestRate }}% · {{ loan.tenureMonths }} months
                      · From {{ loan.startDate | date:'mediumDate' }}
                      @if (loan.notes) { · {{ loan.notes }} }
                    </p>
                  </div>
                  <div class="detail-row-actions">
                    <div class="emi-tag">
                      <span class="emi-label">EMI</span>
                      <strong>{{ loan.emiAmount | currency:'INR':'symbol':'1.0-2' }}</strong>
                    </div>
                    <button class="btn-icon-remove" type="button" (click)="removeLoan(loan.id)" title="Remove">✕</button>
                  </div>
                </div>
              }
            </div>
            <div class="loan-summary">
              <span>Total monthly EMI outflow</span>
              <strong>{{ bps.totalLoanEmi() | currency:'INR':'symbol':'1.0-2' }}</strong>
            </div>
          }
        </section>
      </div>
    </section>
  `,
  styles: [`
    .btn-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      vertical-align: middle;
      margin-right: 0.35rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .btn:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(2px);
    }

    .modal-card {
      width: min(420px, 90vw);
      padding: 1.5rem;
      border-radius: var(--radius-lg);
      box-shadow: 0 12px 40px rgba(0,0,0,0.18);
      animation: modalIn 200ms ease;
    }

    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.95) translateY(8px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .modal-body { margin-bottom: 1.25rem; }

    .modal-detail {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface-2);
      margin: 0.75rem 0;
    }

    .modal-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .btn-danger {
      background: #ef4444;
      color: #fff;
      border: none;
      padding: 0.5rem 1.25rem;
      border-radius: var(--radius-md);
      font-weight: 600;
      cursor: pointer;
      transition: background 150ms;
    }

    .btn-danger:hover { background: #dc2626; }
    .btn-danger:disabled { opacity: 0.65; cursor: not-allowed; }

    .bp-layout {
      display: grid;
      gap: 1.5rem;
      padding: 2rem 0 3rem;
    }

    .bp-hero, .bp-metrics, .bp-panel, .bp-runway-analysis {
      padding: 1.5rem;
    }

    .bp-hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .cta-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1rem;
    }

    .metric-card {
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      display: grid;
      gap: 0.35rem;
    }

    .metric-card strong {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 1.55rem;
    }

    .runway-card.runway-green { border-color: #22c55e; background: #f0fdf4; }
    .runway-card.runway-yellow { border-color: #eab308; background: #fefce8; }
    .runway-card.runway-red { border-color: #ef4444; background: #fef2f2; }

    .bp-runway-analysis { padding: 0; overflow: hidden; }

    .runway-banner {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem 1.5rem;
    }

    .runway-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .runway-banner.runway-green { background: #f0fdf4; }
    .runway-banner.runway-green .runway-indicator { background: #22c55e; }
    .runway-banner.runway-yellow { background: #fefce8; }
    .runway-banner.runway-yellow .runway-indicator { background: #eab308; }
    .runway-banner.runway-red { background: #fef2f2; }
    .runway-banner.runway-red .runway-indicator { background: #ef4444; }

    .runway-banner .section-title { margin-bottom: 0.25rem; }

    .bp-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.5rem;
    }

    .bp-panel-full {
      grid-column: 1 / -1;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .inline-form {
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      margin-bottom: 1rem;
    }

    .detail-stack {
      display: grid;
      gap: 0.75rem;
    }

    .detail-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.85rem 1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface-2);
    }

    .detail-row strong {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .detail-row-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .amount-tag {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-weight: 700;
      white-space: nowrap;
    }

    .btn-icon-remove {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface-2);
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      transition: background 0.15s, color 0.15s;
    }

    .btn-icon-remove:hover {
      background: #fef2f2;
      color: #ef4444;
      border-color: #fecaca;
    }

    .category-breakdown {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .category-chip {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.85rem;
      border: 1px solid var(--line);
      background: var(--surface-2);
    }

    .category-chip strong {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .checkbox-row input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--brand);
    }

    .emi-tag {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.1rem;
    }

    .emi-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .loan-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 1rem;
      padding: 0.85rem 1rem;
      border-radius: var(--radius-md);
      background: var(--brand-light);
      color: var(--brand-dark);
    }

    .loan-summary strong {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 1.1rem;
    }

    .empty-state {
      padding: 1.5rem;
      text-align: center;
      color: var(--text-muted);
      border: 1px dashed var(--line);
      border-radius: var(--radius-lg);
    }

    .bp-filter-bar { padding: 1rem 1.5rem; }

    .filter-bar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .filter-tabs {
      display: flex;
      gap: 0.25rem;
      padding: 0.25rem;
      border-radius: var(--radius-md);
      background: var(--surface-2);
      border: 1px solid var(--line);
    }

    .filter-tab {
      padding: 0.4rem 0.85rem;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 150ms, color 150ms;
    }

    .filter-tab:hover { color: var(--text-primary); }

    .filter-tab.active {
      background: var(--surface);
      color: var(--brand-dark);
      box-shadow: var(--shadow-sm);
    }

    .filter-range-label { font-size: 0.85rem; }

    .bp-comparison {
      display: grid;
      gap: 1.25rem;
      padding: 1.5rem;
      overflow: hidden;
      background:
        radial-gradient(circle at top right, rgba(34, 197, 94, 0.08), transparent 28%),
        linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    }

    .comparison-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    }

    .comparison-title-group {
      display: grid;
      gap: 0.35rem;
      max-width: 42rem;
    }

    .comparison-subtitle {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .comparison-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 0.65rem 0.95rem;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 0.82rem;
      font-weight: 700;
      text-align: center;
      white-space: nowrap;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
    }

    .comparison-badge.positive {
      color: #166534;
      background: #f0fdf4;
      border-color: #bbf7d0;
    }

    .comparison-badge.negative {
      color: #b91c1c;
      background: #fef2f2;
      border-color: #fecaca;
    }

    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .comparison-card {
      position: relative;
      display: grid;
      gap: 0.95rem;
      padding: 1.1rem;
      border: 1px solid rgba(203, 213, 225, 0.8);
      border-radius: var(--radius-lg);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
      box-shadow: 0 12px 24px rgba(15, 23, 42, 0.04);
      overflow: hidden;
    }

    .comparison-card::before {
      content: '';
      position: absolute;
      inset: 0 0 auto;
      height: 3px;
      background: linear-gradient(90deg, var(--brand), #22c55e);
    }

    .comparison-card-label {
      display: block;
      color: var(--text-secondary);
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .comparison-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
      align-items: stretch;
      gap: 1rem;
    }

    .comparison-col {
      display: grid;
      gap: 0.4rem;
      min-width: 0;
    }

    .comparison-period-label {
      display: block;
      font-size: 0.75rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .comparison-value {
      display: block;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: clamp(1.15rem, 1rem + 0.65vw, 1.5rem);
      line-height: 1.15;
      color: var(--text-primary);
      word-break: break-word;
    }

    .comparison-value.faded {
      color: var(--text-secondary);
    }

    .comparison-divider {
      width: 1px;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(203, 213, 225, 0), rgba(203, 213, 225, 1), rgba(203, 213, 225, 0));
    }

    .comparison-change-bar {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding-top: 0.85rem;
      border-top: 1px solid rgba(203, 213, 225, 0.65);
    }

    .comparison-change {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 32px;
      padding: 0.35rem 0.7rem;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 0.78rem;
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
    }

    .comparison-change.positive {
      color: #166534;
      background: #f0fdf4;
      border-color: #bbf7d0;
    }

    .comparison-change.negative {
      color: #b91c1c;
      background: #fef2f2;
      border-color: #fecaca;
    }

    .comparison-change.neutral {
      color: var(--text-secondary);
      background: var(--surface-2);
      border-color: var(--line);
      white-space: normal;
      line-height: 1.35;
    }

    .comparison-highlights {
      display: grid;
      gap: 0.9rem;
      padding: 1.1rem 1.15rem;
      border-radius: var(--radius-lg);
      border: 1px solid rgba(191, 219, 254, 0.9);
      background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%);
    }

    .comparison-highlights-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .comparison-highlights-meta {
      font-size: 0.82rem;
    }

    .highlight-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.75rem;
    }

    .highlight-list li {
      position: relative;
      padding-left: 1.1rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .highlight-list li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.58rem;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--brand);
      box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.12);
    }

    .bp-charts-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.5rem;
    }

    .bp-chart-panel { padding: 1.5rem; }

    .chart-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .chart-head .section-title { font-size: 1.15rem; }

    .chart-total {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .chart-wrap {
      position: relative;
      min-height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chart-wrap canvas { max-height: 280px; }

    .chart-wrap-pie { max-width: 280px; margin: 0 auto; }

    .chart-legend {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
    }

    .chart-legend-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.82rem;
    }

    .chart-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    .chart-legend-item strong {
      margin-left: auto;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 0.82rem;
    }

    .bp-insights { padding: 1.5rem; }

    .insights-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }

    .insights-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .insight-card {
      display: grid;
      gap: 0.3rem;
      padding: 1rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--line);
      background: var(--surface-2);
    }

    .insight-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .insight-value {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 1.25rem;
      font-weight: 700;
    }

    .insight-sub {
      font-size: 0.78rem;
      color: var(--text-secondary);
    }

    .trend-up { color: #dc2626; }
    .trend-down { color: #16a34a; }
    .text-positive { color: #16a34a; }
    .text-negative { color: #dc2626; }

    .top-category-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1rem;
      border-radius: var(--radius-md);
      background: #fef3c7;
      border: 1px solid #fde68a;
      margin-bottom: 1rem;
    }

    .top-category-banner strong {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .insights-breakdown {
      display: grid;
      gap: 0.75rem;
    }

    .insights-cat-list {
      display: grid;
      gap: 0.5rem;
    }

    .insights-cat-row {
      display: grid;
      grid-template-columns: 120px 1fr auto;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.85rem;
    }

    .insights-cat-name {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .insights-cat-bar-wrap {
      height: 8px;
      border-radius: 4px;
      background: var(--surface-2);
      border: 1px solid var(--line);
      overflow: hidden;
    }

    .insights-cat-bar {
      height: 100%;
      border-radius: 4px;
      background: var(--brand);
      transition: width 300ms ease;
    }

    .insights-cat-row strong {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 0.85rem;
      text-align: right;
    }

    @media (max-width: 960px) {
      .bp-grid {
        grid-template-columns: 1fr;
      }

      .bp-hero {
        flex-direction: column;
        align-items: flex-start;
      }

      .metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .bp-charts-row {
        grid-template-columns: 1fr;
      }

      .insights-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .comparison-head {
        flex-direction: column;
        align-items: flex-start;
      }

      .comparison-badge {
        white-space: normal;
      }
    }

    @media (max-width: 600px) {
      .metric-grid {
        grid-template-columns: 1fr;
      }

      .insights-grid {
        grid-template-columns: 1fr;
      }

      .bp-comparison {
        padding: 1.1rem;
      }

      .comparison-grid {
        grid-template-columns: 1fr;
      }

      .comparison-card {
        padding: 1rem;
      }

      .comparison-row {
        grid-template-columns: 1fr;
        gap: 0.85rem;
      }

      .comparison-divider {
        width: 100%;
        height: 1px;
        background: linear-gradient(90deg, rgba(203, 213, 225, 0), rgba(203, 213, 225, 1), rgba(203, 213, 225, 0));
      }

      .comparison-change {
        width: 100%;
      }

      .comparison-highlights {
        padding: 1rem;
      }

      .insights-cat-row {
        grid-template-columns: 90px 1fr auto;
      }

      .detail-row {
        flex-direction: column;
        align-items: flex-start;
      }

      .detail-row-actions {
        width: 100%;
        justify-content: space-between;
      }
    }
  `]
})
export class BusinessProfilePageComponent {
  readonly authService = inject(AuthService);
  readonly bps = inject(BusinessProfileService);
  readonly categoryOptions = expenseCategoryOptions;
  private readonly destroyRef = inject(DestroyRef);

  readonly pieCanvas = viewChild<ElementRef<HTMLCanvasElement>>('pieCanvas');
  readonly barCanvas = viewChild<ElementRef<HTMLCanvasElement>>('barCanvas');

  private pieChart?: Chart;
  private barChart?: Chart;

  readonly selectedPeriod = signal<PeriodFilter>('month');

  readonly periods: Array<{ value: PeriodFilter; label: string }> = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' },
    { value: 'all', label: 'All time' }
  ];

  readonly homeLink = computed(() => this.authService.role() === 'seller' ? '/seller' : '/buyer');

  // Delete confirmation modal
  readonly deleteConfirm = signal<DeleteConfirmation | null>(null);
  readonly deleteInProgress = signal(false);

  // Dashboard range
  readonly dashboardRange = signal<DashboardRange>('monthly');

  // Investment form
  readonly showInvestmentForm = signal(false);
  invName = '';
  invAmount: number | null = null;
  invDate = new Date().toISOString().slice(0, 10);
  invNotes = '';
  readonly invSaving = signal(false);
  readonly invError = signal<string | null>(null);

  // Expense form
  readonly showExpenseForm = signal(false);
  expLabel = '';
  expCategory: ExpenseCategory = 'salary';
  expAmount: number | null = null;
  expDate = new Date().toISOString().slice(0, 10);
  expRecurring = true;
  readonly expSaving = signal(false);
  readonly expError = signal<string | null>(null);

  // Loan form
  readonly showLoanForm = signal(false);
  loanLender = '';
  loanPrincipal: number | null = null;
  loanRate: number | null = null;
  loanTenure: number | null = null;
  loanEmi: number | null = null;
  loanStart = new Date().toISOString().slice(0, 10);
  loanNotes = '';
  readonly loanSaving = signal(false);
  readonly loanError = signal<string | null>(null);

  // Download loading states
  readonly pdfLoading = signal(false);
  readonly excelLoading = signal(false);

  // Filter computations
  readonly filterStartDate = computed(() => {
    const now = new Date();
    switch (this.selectedPeriod()) {
      case 'week': {
        const d = new Date(now);
        d.setDate(now.getDate() - now.getDay());
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'quarter': return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      case 'year': return new Date(now.getFullYear(), 0, 1);
      default: return null;
    }
  });

  readonly filterRangeLabel = computed(() => {
    const start = this.filterStartDate();
    if (!start) return 'Showing all data';
    const fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt.format(start)} — ${fmt.format(new Date())}`;
  });

  // --- Comparison helpers ---
  private comparisonRange(offset: -1 | 0) {
    const now = new Date();
    const period = this.selectedPeriod();
    let start: Date;
    let end: Date;
    switch (period) {
      case 'week': {
        const s = new Date(now);
        s.setDate(now.getDate() - now.getDay() + offset * 7);
        s.setHours(0, 0, 0, 0);
        const e = new Date(s);
        e.setDate(s.getDate() + 7);
        start = s; end = e; break;
      }
      case 'month': {
        const m = now.getMonth() + offset;
        start = new Date(now.getFullYear(), m, 1);
        end = new Date(now.getFullYear(), m + 1, 1);
        break;
      }
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3) + offset;
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), q * 3 + 3, 1);
        break;
      }
      case 'year': {
        const y = now.getFullYear() + offset;
        start = new Date(y, 0, 1);
        end = new Date(y + 1, 0, 1);
        break;
      }
      default: start = new Date(0); end = new Date();
    }
    return { start, end };
  }

  private metricsForRange(range: { start: Date; end: Date }) {
    const inRange = <T extends { date: string }>(items: T[]) => items.filter(i => { const d = new Date(i.date); return d >= range.start && d < range.end; });
    const expenses = inRange(this.bps.expenses());
    const investments = inRange(this.bps.investments());
    const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
    const totalInv = investments.reduce((s, i) => s + i.amount, 0);
    return { totalExpenses: totalExp, totalInvestments: totalInv, expenseCount: expenses.length, investmentCount: investments.length, netCashFlow: totalInv - totalExp, emi: this.bps.totalLoanEmi() };
  }

  readonly comparisonTitle = computed(() => {
    const p = this.selectedPeriod();
    if (p === 'week') return 'This week vs last week';
    if (p === 'month') return 'This month vs last month';
    if (p === 'quarter') return 'This quarter vs last quarter';
    if (p === 'year') return 'This year vs last year';
    return 'Period comparison';
  });

  readonly comparisonCurrentLabel = computed(() => {
    const p = this.selectedPeriod();
    if (p === 'week') return 'This week';
    if (p === 'month') return 'This month';
    if (p === 'quarter') return 'This quarter';
    if (p === 'year') return 'This year';
    return 'Current';
  });

  readonly comparisonPreviousLabel = computed(() => {
    const p = this.selectedPeriod();
    if (p === 'week') return 'Last week';
    if (p === 'month') return 'Last month';
    if (p === 'quarter') return 'Last quarter';
    if (p === 'year') return 'Last year';
    return 'Previous';
  });

  readonly comparisonMetrics = computed(() => {
    const curr = this.metricsForRange(this.comparisonRange(0));
    const prev = this.metricsForRange(this.comparisonRange(-1));
    return [
      { label: 'Total Expenses', current: curr.totalExpenses, previous: prev.totalExpenses, unit: 'currency' as const },
      { label: 'Investments Received', current: curr.totalInvestments, previous: prev.totalInvestments, unit: 'currency' as const },
      { label: 'Net Cash Flow', current: curr.netCashFlow, previous: prev.netCashFlow, unit: 'currency' as const },
      { label: 'Expense Transactions', current: curr.expenseCount, previous: prev.expenseCount, unit: 'number' as const },
      { label: 'Investment Transactions', current: curr.investmentCount, previous: prev.investmentCount, unit: 'number' as const },
      { label: 'Monthly EMI', current: curr.emi, previous: prev.emi, unit: 'currency' as const },
    ];
  });

  readonly comparisonOverallChange = computed(() => {
    const curr = this.metricsForRange(this.comparisonRange(0));
    const prev = this.metricsForRange(this.comparisonRange(-1));
    const currBurn = curr.totalExpenses + curr.emi;
    const prevBurn = prev.totalExpenses + prev.emi;
    if (prevBurn === 0) return 0;
    return ((currBurn - prevBurn) / prevBurn) * 100;
  });

  changePercent(m: { current: number; previous: number }): number {
    if (m.previous === 0) return 0;
    return ((m.current - m.previous) / m.previous) * 100;
  }

  absChangePercent(m: { current: number; previous: number }): number {
    return Math.abs(this.changePercent(m));
  }

  readonly comparisonHighlights = computed(() => {
    const metrics = this.comparisonMetrics();
    const hints: string[] = [];
    const exp = metrics[0];
    const inv = metrics[1];
    const net = metrics[2];

    if (exp.previous > 0) {
      const pct = this.changePercent(exp);
      if (pct > 10) hints.push(`Expenses increased by ${Math.abs(pct).toFixed(1)}% compared to the previous period.`);
      else if (pct < -10) hints.push(`Expenses decreased by ${Math.abs(pct).toFixed(1)}% — good cost control.`);
    }

    if (inv.current > 0 && inv.previous === 0) hints.push('New investment received this period (none in the prior period).');
    else if (inv.current > inv.previous && inv.previous > 0) hints.push(`Investments grew by ${this.changePercent(inv).toFixed(1)}%.`);

    if (net.current > 0 && net.previous <= 0) hints.push('Net cash flow turned positive this period.');
    else if (net.current < 0 && net.previous >= 0) hints.push('Net cash flow turned negative — expenses exceed investments.');

    const balance = this.bps.currentBalance();
    const burn = this.bps.monthlyBurn();
    if (burn > 0 && balance / burn < 3) hints.push('Less than 3 months of runway remaining. Consider reducing burn or raising funds.');

    if (hints.length === 0) hints.push('No significant changes detected between periods.');
    return hints;
  });

  readonly filteredExpenses = computed(() => {
    const start = this.filterStartDate();
    if (!start) return this.bps.expenses();
    return this.bps.expenses().filter(e => new Date(e.date) >= start);
  });

  readonly filteredExpenseTotal = computed(() =>
    this.filteredExpenses().reduce((s, e) => s + e.amount, 0)
  );

  readonly pieChartData = computed(() => {
    const grouped = new Map<ExpenseCategory, number>();
    for (const exp of this.filteredExpenses()) {
      grouped.set(exp.category, (grouped.get(exp.category) || 0) + exp.amount);
    }
    return expenseCategoryOptions
      .map(cat => ({ ...cat, total: grouped.get(cat.value) || 0 }))
      .filter(item => item.total > 0);
  });

  readonly barChartData = computed(() => {
    const months: Array<{ label: string; ym: string }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleString('en-IN', { month: 'short' }),
        ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      });
    }
    return months.map(m => ({
      label: m.label,
      expenses: this.bps.expenses().filter(e => e.date.startsWith(m.ym)).reduce((s, e) => s + e.amount, 0),
      investments: this.bps.investments().filter(inv => inv.date.startsWith(m.ym)).reduce((s, inv) => s + inv.amount, 0),
      emi: this.bps.totalLoanEmi()
    }));
  });

  readonly weekRangeLabel = computed(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
    return `${fmt.format(weekStart)} — ${fmt.format(weekEnd)}`;
  });

  readonly insights = computed(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const thisWeek = this.bps.expenses().filter(e => new Date(e.date) >= weekStart);
    const prevWeek = this.bps.expenses().filter(e => { const d = new Date(e.date); return d >= prevWeekStart && d < weekStart; });
    const thisWeekTotal = thisWeek.reduce((s, e) => s + e.amount, 0);
    const prevWeekTotal = prevWeek.reduce((s, e) => s + e.amount, 0);

    const thisWeekInv = this.bps.investments().filter(inv => new Date(inv.date) >= weekStart);
    const thisWeekInvTotal = thisWeekInv.reduce((s, inv) => s + inv.amount, 0);

    const catMap = new Map<ExpenseCategory, number>();
    for (const e of thisWeek) catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount);
    const topEntry = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0];

    const dailyBurn = this.bps.monthlyBurn() / 30;
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

    return {
      thisWeekExpenses: thisWeekTotal,
      prevWeekExpenses: prevWeekTotal,
      thisWeekInvestments: thisWeekInvTotal,
      investmentCount: thisWeekInv.length,
      topCategory: topEntry ? { label: expenseCategoryOptions.find(c => c.value === topEntry[0])?.label || topEntry[0], amount: topEntry[1] } : null,
      weekOverWeekChange: prevWeekTotal === 0 ? 0 : ((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100,
      dailyBurn,
      weeklyBurn: dailyBurn * 7,
      monthlyEmi: this.bps.totalLoanEmi(),
      netCashFlow: thisWeekInvTotal - thisWeekTotal,
      projectedMonthEndBalance: this.bps.currentBalance() - (dailyBurn * daysLeft),
      daysLeftInMonth: daysLeft,
      expenseCount: thisWeek.length,
      burnToRevenueRatio: this.bps.revenue() > 0 ? (this.bps.monthlyBurn() / this.bps.revenue()) * 100 : 0,
      savingsRate: this.bps.revenue() > 0 ? ((this.bps.revenue() - this.bps.monthlyBurn()) / this.bps.revenue()) * 100 : 0,
      categoriesThisWeek: [...catMap.entries()]
        .map(([cat, total]) => ({ label: expenseCategoryOptions.find(c => c.value === cat)?.label || cat, total }))
        .sort((a, b) => b.total - a.total)
    };
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.pieChart?.destroy();
      this.barChart?.destroy();
    });

    effect(() => {
      const el = this.pieCanvas()?.nativeElement;
      const data = this.pieChartData();
      if (!el) {
        if (this.pieChart) { this.pieChart.destroy(); this.pieChart = undefined; }
        return;
      }
      if (this.pieChart) {
        this.pieChart.data.labels = data.map(d => d.label);
        this.pieChart.data.datasets[0].data = data.map(d => d.total);
        (this.pieChart.data.datasets[0] as any).backgroundColor = data.map(d => CATEGORY_COLORS[d.value] || '#94a3b8');
        this.pieChart.update();
      } else {
        this.pieChart = new Chart(el, {
          type: 'doughnut',
          data: {
            labels: data.map(d => d.label),
            datasets: [{
              data: data.map(d => d.total),
              backgroundColor: data.map(d => CATEGORY_COLORS[d.value] || '#94a3b8'),
              borderWidth: 2,
              borderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ₹${ctx.parsed.toLocaleString('en-IN')}` } }
            }
          }
        });
      }
    });

    effect(() => {
      const el = this.barCanvas()?.nativeElement;
      const data = this.barChartData();
      if (!el) {
        if (this.barChart) { this.barChart.destroy(); this.barChart = undefined; }
        return;
      }
      const labels = data.map(d => d.label);
      const expenses = data.map(d => d.expenses + d.emi);
      const investments = data.map(d => d.investments);
      if (this.barChart) {
        this.barChart.data.labels = labels;
        this.barChart.data.datasets[0].data = expenses;
        this.barChart.data.datasets[1].data = investments;
        this.barChart.update();
      } else {
        this.barChart = new Chart(el, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Expenses + EMI', data: expenses, backgroundColor: '#ef4444', borderRadius: 4 },
              { label: 'Investments', data: investments, backgroundColor: '#22c55e', borderRadius: 4 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
              tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } }
            },
            scales: {
              y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: (v: any) => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } },
              x: { grid: { display: false } }
            }
          }
        });
      }
    });
  }

  readonly runwayStatus = computed(() => {
    const months = this.bps.runwayMonths();
    if (months === Infinity) return 'green';
    if (months >= 12) return 'green';
    if (months >= 6) return 'yellow';
    return 'red';
  });

  readonly runwayLabel = computed(() => {
    const months = this.bps.runwayMonths();
    if (months === Infinity) return 'No burn';
    return `${months} months`;
  });

  readonly runwayDescription = computed(() => {
    const months = this.bps.runwayMonths();
    if (months === Infinity) return 'Your business has no recurring monthly burn. Add expenses or EMIs to calculate runway.';
    if (months >= 12) return `Your business can run smoothly for ${months} months at the current burn rate. Finances look healthy.`;
    if (months >= 6) return `Your business can sustain for ${months} months. Consider reducing expenses or raising funds soon.`;
    if (months > 0) return `Warning: Only ${months} month${months === 1 ? '' : 's'} of runway left. Immediate action is needed to secure funding or reduce costs.`;
    return 'Your expenses exceed your available balance. Urgent financial intervention is required.';
  });

  categoryLabel(category: ExpenseCategory): string {
    return expenseCategoryOptions.find((c) => c.value === category)?.label || category;
  }

  categoryColor(category: string): string {
    return CATEGORY_COLORS[category] || '#94a3b8';
  }

  async addInvestment(): Promise<void> {
    if (!this.invName.trim() || !this.invAmount || this.invAmount <= 0) {
      this.invError.set('Investor name and a valid amount are required.');
      return;
    }
    this.invSaving.set(true);
    this.invError.set(null);
    try {
      await this.bps.addInvestment({
        investorName: this.invName.trim(),
        amount: this.invAmount,
        date: this.invDate,
        notes: this.invNotes.trim() || undefined
      });
      this.invName = '';
      this.invAmount = null;
      this.invNotes = '';
      this.showInvestmentForm.set(false);
    } catch (e) {
      this.invError.set(e instanceof Error ? e.message : 'Could not save investment.');
    } finally {
      this.invSaving.set(false);
    }
  }

  async removeInvestment(id: string): Promise<void> {
    const inv = this.bps.investments().find(i => i.id === id);
    if (!inv) return;
    this.deleteConfirm.set({ id, type: 'investment', label: inv.investorName, amount: inv.amount });
  }

  async addExpense(): Promise<void> {
    if (!this.expLabel.trim() || !this.expAmount || this.expAmount <= 0) {
      this.expError.set('Description and a valid amount are required.');
      return;
    }
    this.expSaving.set(true);
    this.expError.set(null);
    try {
      await this.bps.addExpense({
        category: this.expCategory,
        label: this.expLabel.trim(),
        amount: this.expAmount,
        date: this.expDate,
        recurring: this.expRecurring
      });
      this.expLabel = '';
      this.expAmount = null;
      this.expRecurring = true;
      this.showExpenseForm.set(false);
    } catch (e) {
      this.expError.set(e instanceof Error ? e.message : 'Could not save expense.');
    } finally {
      this.expSaving.set(false);
    }
  }

  async removeExpense(id: string): Promise<void> {
    const exp = this.bps.expenses().find(e => e.id === id);
    if (!exp) return;
    this.deleteConfirm.set({ id, type: 'expense', label: exp.label, amount: exp.amount });
  }

  async addLoan(): Promise<void> {
    if (!this.loanLender.trim() || !this.loanPrincipal || this.loanPrincipal <= 0 || !this.loanEmi || this.loanEmi <= 0) {
      this.loanError.set('Lender, principal, and EMI amount are required.');
      return;
    }
    this.loanSaving.set(true);
    this.loanError.set(null);
    try {
      await this.bps.addLoan({
        lender: this.loanLender.trim(),
        principalAmount: this.loanPrincipal,
        interestRate: this.loanRate || 0,
        tenureMonths: this.loanTenure || 0,
        emiAmount: this.loanEmi,
        startDate: this.loanStart,
        notes: this.loanNotes.trim() || undefined
      });
      this.loanLender = '';
      this.loanPrincipal = null;
      this.loanRate = null;
      this.loanTenure = null;
      this.loanEmi = null;
      this.loanNotes = '';
      this.showLoanForm.set(false);
    } catch (e) {
      this.loanError.set(e instanceof Error ? e.message : 'Could not save loan.');
    } finally {
      this.loanSaving.set(false);
    }
  }

  async removeLoan(id: string): Promise<void> {
    const loan = this.bps.loans().find(l => l.id === id);
    if (!loan) return;
    this.deleteConfirm.set({ id, type: 'loan', label: loan.lender, amount: loan.emiAmount });
  }

  cancelDelete(): void {
    this.deleteConfirm.set(null);
    this.deleteInProgress.set(false);
  }

  async confirmDelete(): Promise<void> {
    const item = this.deleteConfirm();
    if (!item) return;
    this.deleteInProgress.set(true);
    try {
      if (item.type === 'investment') await this.bps.removeInvestment(item.id);
      else if (item.type === 'expense') await this.bps.removeExpense(item.id);
      else if (item.type === 'loan') await this.bps.removeLoan(item.id);
    } finally {
      this.deleteConfirm.set(null);
      this.deleteInProgress.set(false);
    }
  }

  async downloadPdf(): Promise<void> {
    this.pdfLoading.set(true);
    try {
      await this.bps.downloadPdf();
    } finally {
      this.pdfLoading.set(false);
    }
  }

  async downloadExcel(): Promise<void> {
    this.excelLoading.set(true);
    try {
      await this.bps.downloadExcel();
    } finally {
      this.excelLoading.set(false);
    }
  }
}

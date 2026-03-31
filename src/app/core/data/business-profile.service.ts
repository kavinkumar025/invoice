import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Database, off, onValue, push, ref, remove, set } from '@angular/fire/database';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

import { AuthService } from '../auth/auth.service';
import { OrderService } from './order.service';
import { removeUndefinedDeep } from './firebase-data.util';
import {
  BusinessProfile,
  ExpenseCategory,
  ExpenseEntry,
  InvestmentEntry,
  LoanEntry,
  expenseCategoryOptions
} from '../models/commerce.models';

@Injectable({ providedIn: 'root' })
export class BusinessProfileService {
  private readonly database = inject(Database);
  private readonly authService = inject(AuthService);
  private readonly orderService = inject(OrderService);

  private readonly profileSignal = signal<BusinessProfile>({ investments: {}, expenses: {}, loans: {} });
  private readonly loadingSignal = signal(false);

  private readonly currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  private readonly pdfCurrencyNumberFormatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  private readonly dateFormatter = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  readonly loading = this.loadingSignal.asReadonly();

  readonly investments = computed(() => {
    const record = this.profileSignal().investments;
    return Object.entries(record).map(([id, entry]) => ({ ...entry, id }));
  });

  readonly expenses = computed(() => {
    const record = this.profileSignal().expenses;
    return Object.entries(record).map(([id, entry]) => ({ ...entry, id }));
  });

  readonly loans = computed(() => {
    const record = this.profileSignal().loans;
    return Object.entries(record).map(([id, entry]) => ({ ...entry, id }));
  });

  readonly totalInvestment = computed(() => this.investments().reduce((sum, inv) => sum + inv.amount, 0));

  readonly recurringExpenses = computed(() => this.expenses().filter((exp) => exp.recurring));

  readonly totalMonthlyExpenses = computed(() =>
    this.recurringExpenses().reduce((sum, exp) => sum + exp.amount, 0)
  );

  readonly totalOneTimeExpenses = computed(() =>
    this.expenses().filter((exp) => !exp.recurring).reduce((sum, exp) => sum + exp.amount, 0)
  );

  readonly totalLoanEmi = computed(() => this.loans().reduce((sum, loan) => sum + loan.emiAmount, 0));

  readonly totalLoanPrincipal = computed(() => this.loans().reduce((sum, loan) => sum + loan.principalAmount, 0));

  readonly monthlyBurn = computed(() => this.totalMonthlyExpenses() + this.totalLoanEmi());

  readonly revenue = computed(() => {
    const role = this.authService.role();
    if (role === 'seller') {
      return this.orderService
        .sellerOrders()
        .filter((o) => o.status === 'confirmed' || o.status === 'delivered')
        .reduce((sum, o) => sum + o.totalAmount, 0);
    }
    return this.orderService.buyerOrders().reduce((sum, o) => sum + o.totalAmount, 0);
  });

  readonly currentBalance = computed(() => this.totalInvestment() - this.totalOneTimeExpenses());

  readonly runwayMonths = computed(() => {
    const burn = this.monthlyBurn();
    if (burn <= 0) return Infinity;
    const balance = this.currentBalance();
    if (balance <= 0) return 0;
    return Math.floor(balance / burn);
  });

  readonly expensesByCategory = computed(() => {
    const grouped = new Map<ExpenseCategory, number>();
    for (const exp of this.recurringExpenses()) {
      grouped.set(exp.category, (grouped.get(exp.category) || 0) + exp.amount);
    }
    return expenseCategoryOptions
      .map((cat) => ({ ...cat, total: grouped.get(cat.value) || 0 }))
      .filter((cat) => cat.total > 0);
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.authService.currentUser()?.uid;

      if (!uid) {
        this.profileSignal.set({ investments: {}, expenses: {}, loans: {} });
        this.loadingSignal.set(false);
        return;
      }

      const profileRef = ref(this.database, `business-profiles/${uid}`);
      this.loadingSignal.set(true);

      onValue(profileRef, (snapshot) => {
        if (!snapshot.exists()) {
          this.profileSignal.set({ investments: {}, expenses: {}, loans: {} });
        } else {
          const data = snapshot.val() as Partial<BusinessProfile>;
          this.profileSignal.set({
            investments: data.investments || {},
            expenses: data.expenses || {},
            loans: data.loans || {}
          });
        }
        this.loadingSignal.set(false);
      });

      onCleanup(() => off(profileRef));
    });
  }

  async addInvestment(entry: Omit<InvestmentEntry, 'id'>): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid) throw new Error('Sign in to manage business profile.');
    const entryRef = push(ref(this.database, `business-profiles/${uid}/investments`));
    await set(entryRef, removeUndefinedDeep({ ...entry, id: entryRef.key }));
  }

  async removeInvestment(id: string): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid) throw new Error('Sign in to manage business profile.');
    await remove(ref(this.database, `business-profiles/${uid}/investments/${id}`));
  }

  async addExpense(entry: Omit<ExpenseEntry, 'id'>): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid) throw new Error('Sign in to manage business profile.');
    const entryRef = push(ref(this.database, `business-profiles/${uid}/expenses`));
    await set(entryRef, removeUndefinedDeep({ ...entry, id: entryRef.key }));
  }

  async removeExpense(id: string): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid) throw new Error('Sign in to manage business profile.');
    await remove(ref(this.database, `business-profiles/${uid}/expenses/${id}`));
  }

  async addLoan(entry: Omit<LoanEntry, 'id'>): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid) throw new Error('Sign in to manage business profile.');
    const entryRef = push(ref(this.database, `business-profiles/${uid}/loans`));
    await set(entryRef, removeUndefinedDeep({ ...entry, id: entryRef.key }));
  }

  async removeLoan(id: string): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid) throw new Error('Sign in to manage business profile.');
    await remove(ref(this.database, `business-profiles/${uid}/loans/${id}`));
  }

  formatCurrency(amount: number): string {
    return this.currencyFormatter.format(amount);
  }

  formatDate(date: string): string {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? date : this.dateFormatter.format(d);
  }

  async downloadPdf(): Promise<void> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
    const pageSize: [number, number] = [595.28, 841.89];

    // Colors
    const brandDark = rgb(0.08, 0.35, 0.24);
    const brand = rgb(0.12, 0.46, 0.32);
    const brandLight = rgb(0.91, 0.97, 0.93);
    const white = rgb(1, 1, 1);
    const text = rgb(0.12, 0.12, 0.12);
    const muted = rgb(0.45, 0.45, 0.45);
    const line = rgb(0.88, 0.88, 0.88);
    const rowAlt = rgb(0.97, 0.97, 0.97);
    const redLight = rgb(1, 0.95, 0.95);
    const red = rgb(0.87, 0.15, 0.15);
    const greenLight = rgb(0.93, 0.99, 0.93);
    const green = rgb(0.13, 0.64, 0.2);

    const mX = 40;
    const rX = 555;
    const contentWidth = rX - mX;
    const bottom = 55;

    let page = doc.addPage(pageSize);
    let y = page.getHeight();

    const ensureSpace = (needed: number): void => {
      if (y - needed < bottom) {
        // Footer on current page
        this.drawPageFooter(page, mX, rX, regular, muted, line, doc.getPageCount());
        page = doc.addPage(pageSize);
        y = page.getHeight() - 50;
      }
    };

    const drawText = (value: string, options: Parameters<PDFPage['drawText']>[1]): void => {
      this.drawPdfText(page, value, options);
    };

    // === HEADER BANNER ===
    page.drawRectangle({ x: 0, y: y - 100, width: pageSize[0], height: 100, color: brandDark });
    page.drawRectangle({ x: 0, y: y - 104, width: pageSize[0], height: 4, color: brand });

    drawText('PERSONAL FINANCE REPORT', { x: mX, y: y - 38, size: 20, font: bold, color: white });

    const bizName = this.authService.profile()?.businessName || this.authService.profile()?.name || 'My Business';
    drawText(bizName, { x: mX, y: y - 58, size: 11, font: regular, color: rgb(0.75, 0.88, 0.8) });

    const dateStr = this.dateFormatter.format(new Date());
    drawText(`Report generated: ${dateStr}`, { x: mX, y: y - 78, size: 9, font: italic, color: rgb(0.65, 0.78, 0.7) });

    // Right side — balance highlight
    const balStr = this.formatPdfCurrency(this.currentBalance());
    this.drawRight(page, balStr, rX, y - 42, 18, bold, white);
    this.drawRight(page, 'Current Balance', rX, y - 60, 9, regular, rgb(0.75, 0.88, 0.8));
    y -= 124;

    // === SUMMARY CARDS ROW ===
    const cardW = (contentWidth - 16) / 3;
    const cardH = 56;
    const summaryCards = [
      { label: 'Total Investment', value: this.formatPdfCurrency(this.totalInvestment()), bg: greenLight, accent: green },
      { label: 'Monthly Burn', value: this.formatPdfCurrency(this.monthlyBurn()), bg: redLight, accent: red },
      { label: 'Runway', value: this.runwayMonths() === Infinity ? 'No burn' : `${this.runwayMonths()} months`, bg: brandLight, accent: brand }
    ];

    for (let i = 0; i < summaryCards.length; i++) {
      const card = summaryCards[i];
      const cx = mX + i * (cardW + 8);
      page.drawRectangle({ x: cx, y: y - cardH, width: cardW, height: cardH, color: card.bg, borderColor: line, borderWidth: 0.5 });
      page.drawRectangle({ x: cx, y: y - 4, width: cardW, height: 4, color: card.accent });
      drawText(card.label, { x: cx + 10, y: y - 22, size: 8, font: regular, color: muted });
      drawText(card.value, { x: cx + 10, y: y - 42, size: 14, font: bold, color: text });
    }
    y -= cardH + 12;

    // Second row of cards
    const summaryCards2 = [
      { label: 'Revenue', value: this.formatPdfCurrency(this.revenue()), bg: white, accent: brand },
      { label: 'Monthly Expenses', value: this.formatPdfCurrency(this.totalMonthlyExpenses()), bg: white, accent: red },
      { label: 'Active Loans / EMI', value: `${this.loans().length} loans - ${this.formatPdfCurrency(this.totalLoanEmi())}/mo`, bg: white, accent: brandDark }
    ];

    for (let i = 0; i < summaryCards2.length; i++) {
      const card = summaryCards2[i];
      const cx = mX + i * (cardW + 8);
      page.drawRectangle({ x: cx, y: y - cardH, width: cardW, height: cardH, color: card.bg, borderColor: line, borderWidth: 0.5 });
      page.drawRectangle({ x: cx, y: y - 4, width: cardW, height: 4, color: card.accent });
      drawText(card.label, { x: cx + 10, y: y - 22, size: 8, font: regular, color: muted });
      drawText(card.value, { x: cx + 10, y: y - 42, size: 12, font: bold, color: text });
    }
    y -= cardH + 24;

    // === EXPENSE BREAKDOWN BY CATEGORY ===
    if (this.expensesByCategory().length > 0) {
      ensureSpace(80);
      drawText('EXPENSE BREAKDOWN', { x: mX, y, size: 10, font: bold, color: brand });
      y -= 8;
      page.drawLine({ start: { x: mX, y }, end: { x: rX, y }, thickness: 1, color: brand });
      y -= 18;

      const barMaxWidth = 200;
      const totalRecurring = this.totalMonthlyExpenses();
      for (const cat of this.expensesByCategory()) {
        ensureSpace(22);
        const pct = totalRecurring > 0 ? cat.total / totalRecurring : 0;
        drawText(cat.label, { x: mX + 4, y, size: 9, font: regular, color: text });
        // Bar background
        page.drawRectangle({ x: 180, y: y - 2, width: barMaxWidth, height: 12, color: rowAlt });
        // Bar filled
        page.drawRectangle({ x: 180, y: y - 2, width: barMaxWidth * pct, height: 12, color: brand });
        // Value + percentage
        drawText(`${this.formatPdfCurrency(cat.total)}  (${(pct * 100).toFixed(1)}%)`, { x: 390, y, size: 9, font: regular, color: text });
        y -= 20;
      }
      y -= 12;
    }

    // === INVESTMENTS TABLE ===
    ensureSpace(50);
    drawText('INVESTMENTS', { x: mX, y, size: 10, font: bold, color: brand });
    y -= 8;
    page.drawLine({ start: { x: mX, y }, end: { x: rX, y }, thickness: 1, color: brand });
    y -= 18;

    if (this.investments().length === 0) {
      drawText('No investments recorded.', { x: mX + 8, y, size: 10, font: italic, color: muted });
      y -= 24;
    } else {
      // Header row
      page.drawRectangle({ x: mX, y: y - 5, width: contentWidth, height: 20, color: brandLight });
      drawText('Investor', { x: mX + 8, y, size: 9, font: bold, color: brandDark });
      drawText('Date', { x: 300, y, size: 9, font: bold, color: brandDark });
      drawText('Notes', { x: 380, y, size: 9, font: bold, color: brandDark });
      this.drawRight(page, 'Amount', rX - 8, y, 9, bold, brandDark);
      y -= 22;

      let rowIdx = 0;
      let totalInv = 0;
      for (const inv of this.investments()) {
        ensureSpace(20);
        if (rowIdx % 2 === 1) {
          page.drawRectangle({ x: mX, y: y - 5, width: contentWidth, height: 18, color: rowAlt });
        }
        const nameStr = inv.investorName.length > 30 ? inv.investorName.substring(0, 28) + '…' : inv.investorName;
        drawText(nameStr, { x: mX + 8, y, size: 9, font: regular, color: text });
        drawText(this.formatDate(inv.date), { x: 300, y, size: 9, font: regular, color: muted });
        if (inv.notes) {
          const notesStr = inv.notes.length > 18 ? inv.notes.substring(0, 16) + '…' : inv.notes;
          drawText(notesStr, { x: 380, y, size: 8, font: regular, color: muted });
        }
        this.drawRight(page, this.formatPdfCurrency(inv.amount), rX - 8, y, 9, regular, text);
        totalInv += inv.amount;
        y -= 18;
        rowIdx++;
      }
      // Total row
      page.drawLine({ start: { x: mX, y: y + 4 }, end: { x: rX, y: y + 4 }, thickness: 0.5, color: line });
      drawText('Total', { x: mX + 8, y, size: 9, font: bold, color: text });
      this.drawRight(page, this.formatPdfCurrency(totalInv), rX - 8, y, 9, bold, brand);
      y -= 12;
    }
    y -= 12;

    // === EXPENSES TABLE ===
    ensureSpace(50);
    drawText('MONTHLY EXPENSES', { x: mX, y, size: 10, font: bold, color: brand });
    y -= 8;
    page.drawLine({ start: { x: mX, y }, end: { x: rX, y }, thickness: 1, color: brand });
    y -= 18;

    if (this.recurringExpenses().length === 0) {
      drawText('No recurring expenses recorded.', { x: mX + 8, y, size: 10, font: italic, color: muted });
      y -= 24;
    } else {
      page.drawRectangle({ x: mX, y: y - 5, width: contentWidth, height: 20, color: brandLight });
      drawText('Description', { x: mX + 8, y, size: 9, font: bold, color: brandDark });
      drawText('Category', { x: 280, y, size: 9, font: bold, color: brandDark });
      drawText('Date', { x: 380, y, size: 9, font: bold, color: brandDark });
      this.drawRight(page, 'Amount', rX - 8, y, 9, bold, brandDark);
      y -= 22;

      let rowIdx = 0;
      let totalExp = 0;
      for (const exp of this.recurringExpenses()) {
        ensureSpace(20);
        if (rowIdx % 2 === 1) {
          page.drawRectangle({ x: mX, y: y - 5, width: contentWidth, height: 18, color: rowAlt });
        }
        const labelStr = exp.label.length > 28 ? exp.label.substring(0, 26) + '…' : exp.label;
        drawText(labelStr, { x: mX + 8, y, size: 9, font: regular, color: text });
        const catLabel = expenseCategoryOptions.find((c) => c.value === exp.category)?.label || exp.category;
        drawText(catLabel, { x: 280, y, size: 9, font: regular, color: muted });
        drawText(this.formatDate(exp.date), { x: 380, y, size: 9, font: regular, color: muted });
        this.drawRight(page, this.formatPdfCurrency(exp.amount), rX - 8, y, 9, regular, text);
        totalExp += exp.amount;
        y -= 18;
        rowIdx++;
      }
      page.drawLine({ start: { x: mX, y: y + 4 }, end: { x: rX, y: y + 4 }, thickness: 0.5, color: line });
      drawText('Total Monthly', { x: mX + 8, y, size: 9, font: bold, color: text });
      this.drawRight(page, this.formatPdfCurrency(totalExp), rX - 8, y, 9, bold, red);
      y -= 12;
    }
    y -= 12;

    // === ONE-TIME EXPENSES ===
    const oneTimeExps = this.expenses().filter(e => !e.recurring);
    if (oneTimeExps.length > 0) {
      ensureSpace(50);
      drawText('ONE-TIME EXPENSES', { x: mX, y, size: 10, font: bold, color: brand });
      y -= 8;
      page.drawLine({ start: { x: mX, y }, end: { x: rX, y }, thickness: 1, color: brand });
      y -= 18;

      page.drawRectangle({ x: mX, y: y - 5, width: contentWidth, height: 20, color: brandLight });
      drawText('Description', { x: mX + 8, y, size: 9, font: bold, color: brandDark });
      drawText('Category', { x: 280, y, size: 9, font: bold, color: brandDark });
      drawText('Date', { x: 380, y, size: 9, font: bold, color: brandDark });
      this.drawRight(page, 'Amount', rX - 8, y, 9, bold, brandDark);
      y -= 22;

      let rowIdx = 0;
      let totalOneTime = 0;
      for (const exp of oneTimeExps) {
        ensureSpace(20);
        if (rowIdx % 2 === 1) {
          page.drawRectangle({ x: mX, y: y - 5, width: contentWidth, height: 18, color: rowAlt });
        }
        const labelStr = exp.label.length > 28 ? exp.label.substring(0, 26) + '…' : exp.label;
        drawText(labelStr, { x: mX + 8, y, size: 9, font: regular, color: text });
        const catLabel = expenseCategoryOptions.find((c) => c.value === exp.category)?.label || exp.category;
        drawText(catLabel, { x: 280, y, size: 9, font: regular, color: muted });
        drawText(this.formatDate(exp.date), { x: 380, y, size: 9, font: regular, color: muted });
        this.drawRight(page, this.formatPdfCurrency(exp.amount), rX - 8, y, 9, regular, text);
        totalOneTime += exp.amount;
        y -= 18;
        rowIdx++;
      }
      page.drawLine({ start: { x: mX, y: y + 4 }, end: { x: rX, y: y + 4 }, thickness: 0.5, color: line });
      drawText('Total One-time', { x: mX + 8, y, size: 9, font: bold, color: text });
      this.drawRight(page, this.formatPdfCurrency(totalOneTime), rX - 8, y, 9, bold, red);
      y -= 24;
    }

    // === LOANS TABLE ===
    ensureSpace(50);
    drawText('LOANS & EMI', { x: mX, y, size: 10, font: bold, color: brand });
    y -= 8;
    page.drawLine({ start: { x: mX, y }, end: { x: rX, y }, thickness: 1, color: brand });
    y -= 18;

    if (this.loans().length === 0) {
      drawText('No loans recorded.', { x: mX + 8, y, size: 10, font: italic, color: muted });
      y -= 24;
    } else {
      page.drawRectangle({ x: mX, y: y - 5, width: contentWidth, height: 20, color: brandLight });
      drawText('Lender', { x: mX + 8, y, size: 8, font: bold, color: brandDark });
      drawText('Principal', { x: 190, y, size: 8, font: bold, color: brandDark });
      drawText('Rate', { x: 290, y, size: 8, font: bold, color: brandDark });
      drawText('Tenure', { x: 340, y, size: 8, font: bold, color: brandDark });
      drawText('Start', { x: 405, y, size: 8, font: bold, color: brandDark });
      this.drawRight(page, 'EMI / mo', rX - 8, y, 8, bold, brandDark);
      y -= 22;

      let rowIdx = 0;
      for (const loan of this.loans()) {
        ensureSpace(20);
        if (rowIdx % 2 === 1) {
          page.drawRectangle({ x: mX, y: y - 5, width: contentWidth, height: 18, color: rowAlt });
        }
        const lenderStr = loan.lender.length > 20 ? loan.lender.substring(0, 18) + '…' : loan.lender;
        drawText(lenderStr, { x: mX + 8, y, size: 9, font: regular, color: text });
        drawText(this.formatPdfCurrency(loan.principalAmount), { x: 190, y, size: 9, font: regular, color: text });
        drawText(`${loan.interestRate}%`, { x: 290, y, size: 9, font: regular, color: muted });
        drawText(`${loan.tenureMonths} mo`, { x: 340, y, size: 9, font: regular, color: muted });
        drawText(this.formatDate(loan.startDate), { x: 405, y, size: 8, font: regular, color: muted });
        this.drawRight(page, this.formatPdfCurrency(loan.emiAmount), rX - 8, y, 9, bold, red);
        y -= 18;
        rowIdx++;
      }
      page.drawLine({ start: { x: mX, y: y + 4 }, end: { x: rX, y: y + 4 }, thickness: 0.5, color: line });
      drawText('Total EMI / month', { x: mX + 8, y, size: 9, font: bold, color: text });
      this.drawRight(page, this.formatPdfCurrency(this.totalLoanEmi()), rX - 8, y, 9, bold, red);
      drawText('Total Principal', { x: 250, y, size: 9, font: bold, color: text });
      drawText(this.formatPdfCurrency(this.totalLoanPrincipal()), { x: 350, y, size: 9, font: regular, color: text });
      y -= 24;
    }

    // === RUNWAY ANALYSIS BANNER ===
    ensureSpace(55);
    const runwayMonths = this.runwayMonths();
    const runwayColor = runwayMonths === Infinity || runwayMonths >= 12 ? green : runwayMonths >= 6 ? rgb(0.85, 0.65, 0) : red;
    const runwayBg = runwayMonths === Infinity || runwayMonths >= 12 ? greenLight : runwayMonths >= 6 ? rgb(1, 0.98, 0.9) : redLight;

    page.drawRectangle({ x: mX, y: y - 40, width: contentWidth, height: 44, color: runwayBg, borderColor: runwayColor, borderWidth: 1 });
    page.drawRectangle({ x: mX, y: y - 40, width: 5, height: 44, color: runwayColor });
    drawText('RUNWAY ANALYSIS', { x: mX + 16, y: y - 10, size: 9, font: bold, color: runwayColor });
    const runwayStr = runwayMonths === Infinity
      ? 'No monthly burn — your business has no recurring expenses.'
      : runwayMonths > 0
        ? `Your business can sustain for ${runwayMonths} months at the current burn rate of ${this.formatPdfCurrency(this.monthlyBurn())}/month.`
        : 'Expenses exceed available balance. Urgent action needed.';
    drawText(runwayStr, { x: mX + 16, y: y - 28, size: 9, font: regular, color: text });
    y -= 52;

    // Footer on last page
    this.drawPageFooter(page, mX, rX, regular, muted, line, doc.getPageCount());

    const bytes = await doc.save();
    this.triggerDownload(bytes, 'personal-finance-report.pdf', 'application/pdf');
  }

  private drawPageFooter(page: PDFPage, mX: number, rX: number, font: PDFFont, color: RGB, line: RGB, pageNum: number): void {
    page.drawLine({ start: { x: mX, y: 40 }, end: { x: rX, y: 40 }, thickness: 0.5, color: line });
    const dateStr = this.dateFormatter.format(new Date());
    this.drawPdfText(page, `Generated on ${dateStr} - InvoiceHub B2B`, { x: mX, y: 28, size: 7, font, color });
    this.drawRight(page, `Page ${pageNum}`, rX, 28, 7, font, color);
  }

  async downloadExcel(): Promise<void> {
    const XLSX = await import('xlsx');

    // === Summary Sheet ===
    const summaryData = [
      ['PERSONAL FINANCE REPORT'],
      [this.authService.profile()?.businessName || this.authService.profile()?.name || 'My Business'],
      [`Generated: ${this.dateFormatter.format(new Date())}`],
      [],
      ['Metric', 'Value', 'Notes'],
      ['Total Investment', this.totalInvestment(), `${this.investments().length} investor(s)`],
      ['Monthly Expenses', this.totalMonthlyExpenses(), `${this.recurringExpenses().length} recurring`],
      ['One-time Expenses', this.totalOneTimeExpenses(), `${this.expenses().filter(e => !e.recurring).length} entries`],
      ['Monthly EMI', this.totalLoanEmi(), `${this.loans().length} active loan(s)`],
      ['Monthly Burn Rate', this.monthlyBurn(), 'Expenses + EMI'],
      ['Revenue', this.revenue(), 'From orders'],
      ['Current Balance', this.currentBalance(), 'Investment − One-time expenses'],
      ['Runway (months)', this.runwayMonths() === Infinity ? 'No burn' : this.runwayMonths(), this.runwayMonths() === Infinity ? 'No recurring costs' : `At ${this.formatCurrency(this.monthlyBurn())}/month burn`],
      [],
      ['EXPENSE BREAKDOWN BY CATEGORY'],
      ['Category', 'Monthly Amount', '% of Total'],
      ...this.expensesByCategory().map(cat => [
        cat.label,
        cat.total,
        this.totalMonthlyExpenses() > 0 ? `${((cat.total / this.totalMonthlyExpenses()) * 100).toFixed(1)}%` : '0%'
      ])
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 30 }];
    summarySheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } }
    ];

    // === Investments Sheet ===
    const investmentsData = [
      ['INVESTMENTS'],
      [`Total: ${this.formatCurrency(this.totalInvestment())} from ${this.investments().length} investor(s)`],
      [],
      ['#', 'Investor Name', 'Amount (INR)', 'Date', 'Notes'],
      ...this.investments().map((inv, i) => [i + 1, inv.investorName, inv.amount, inv.date, inv.notes || '—'])
    ];
    if (this.investments().length > 0) {
      investmentsData.push([], ['', 'TOTAL', this.totalInvestment(), '', '']);
    }
    const investmentsSheet = XLSX.utils.aoa_to_sheet(investmentsData);
    investmentsSheet['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 28 }];
    investmentsSheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }
    ];

    // === Expenses Sheet ===
    const allExpenses = this.expenses();
    const recurringExps = allExpenses.filter(e => e.recurring);
    const oneTimeExps = allExpenses.filter(e => !e.recurring);
    const expensesData: (string | number)[][] = [
      ['EXPENSES'],
      [`Monthly recurring: ${this.formatCurrency(this.totalMonthlyExpenses())} · One-time: ${this.formatCurrency(this.totalOneTimeExpenses())}`],
      [],
      ['RECURRING EXPENSES'],
      ['#', 'Description', 'Category', 'Amount (INR)', 'Date'],
      ...recurringExps.map((exp, i) => [
        i + 1,
        exp.label,
        expenseCategoryOptions.find((c) => c.value === exp.category)?.label || exp.category,
        exp.amount,
        exp.date
      ])
    ];
    if (recurringExps.length > 0) {
      expensesData.push(['', 'SUBTOTAL', '', this.totalMonthlyExpenses(), '']);
    }
    expensesData.push([], ['ONE-TIME EXPENSES'], ['#', 'Description', 'Category', 'Amount (INR)', 'Date']);
    oneTimeExps.forEach((exp, i) => {
      expensesData.push([
        i + 1,
        exp.label,
        expenseCategoryOptions.find((c) => c.value === exp.category)?.label || exp.category,
        exp.amount,
        exp.date
      ]);
    });
    if (oneTimeExps.length > 0) {
      expensesData.push(['', 'SUBTOTAL', '', this.totalOneTimeExpenses(), '']);
    }
    const expensesSheet = XLSX.utils.aoa_to_sheet(expensesData);
    expensesSheet['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
    expensesSheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }
    ];

    // === Loans Sheet ===
    const loansData: (string | number)[][] = [
      ['LOANS & EMI'],
      [`${this.loans().length} active loan(s) · Total EMI: ${this.formatCurrency(this.totalLoanEmi())}/month · Total Principal: ${this.formatCurrency(this.totalLoanPrincipal())}`],
      [],
      ['#', 'Lender', 'Principal (INR)', 'Interest Rate (%)', 'Tenure (months)', 'EMI (INR)', 'Start Date', 'Notes'],
      ...this.loans().map((loan, i) => [
        i + 1,
        loan.lender,
        loan.principalAmount,
        loan.interestRate,
        loan.tenureMonths,
        loan.emiAmount,
        loan.startDate,
        loan.notes || '—'
      ])
    ];
    if (this.loans().length > 0) {
      loansData.push([], ['', 'TOTAL', this.totalLoanPrincipal(), '', '', this.totalLoanEmi(), '', '']);
    }
    const loansSheet = XLSX.utils.aoa_to_sheet(loansData);
    loansSheet['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];
    loansSheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    XLSX.utils.book_append_sheet(wb, investmentsSheet, 'Investments');
    XLSX.utils.book_append_sheet(wb, expensesSheet, 'Expenses');
    XLSX.utils.book_append_sheet(wb, loansSheet, 'Loans');

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    this.triggerDownload(new Uint8Array(buffer), 'personal-finance-report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  private drawRight(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color: RGB): void {
    const printableText = this.toPdfText(text);
    const width = font.widthOfTextAtSize(printableText, size);
    this.drawPdfText(page, printableText, { x: x - width, y, size, font, color });
  }

  private triggerDownload(data: Uint8Array, fileName: string, mimeType: string): void {
    const blobData = data.slice().buffer;
    const blob = new Blob([blobData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private drawPdfText(page: PDFPage, text: string, options: Parameters<PDFPage['drawText']>[1]): void {
    page.drawText(this.toPdfText(text), options);
  }

  private formatPdfCurrency(amount: number): string {
    const formattedAmount = this.pdfCurrencyNumberFormatter.format(Math.abs(amount));
    return amount < 0 ? `-Rs. ${formattedAmount}` : `Rs. ${formattedAmount}`;
  }

  private toPdfText(text: string): string {
    return text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/₹/g, 'Rs. ')
      .replace(/[‐‑‒–—−]/g, '-')
      .replace(/…/g, '...')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\u00A0/g, ' ')
      .replace(/[^\x20-\x7E\n\r\t]/g, '?');
  }
}

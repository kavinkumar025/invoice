import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Database, off, onValue, push, ref, runTransaction, set, update } from '@angular/fire/database';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

import { AuthService } from '../auth/auth.service';
import { AddressService } from './address.service';
import { CartService } from './cart.service';
import { removeUndefinedDeep } from './firebase-data.util';
import { CheckoutResult, Invoice, Order } from '../models/commerce.models';

interface DownloadableInvoice extends Invoice {
  fileName: string;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly database = inject(Database);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly addressService = inject(AddressService);
  private readonly ordersSignal = signal<Order[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  private readonly dateFormatter = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  readonly orders = this.ordersSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly buyerOrders = computed(() => {
    const buyerId = this.authService.currentUser()?.uid;
    return this.ordersSignal().filter((order) => order.buyerId === buyerId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
  readonly sellerOrders = computed(() => {
    const sellerId = this.authService.currentUser()?.uid;
    return this.ordersSignal().filter((order) => order.sellerId === sellerId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });

  constructor() {
    effect((onCleanup) => {
      const userId = this.authService.currentUser()?.uid;

      if (!userId) {
        this.ordersSignal.set([]);
        this.loadingSignal.set(false);
        return;
      }

      const ordersRef = ref(this.database, 'orders');
      this.loadingSignal.set(true);

      onValue(ordersRef, (snapshot) => {
        if (!snapshot.exists()) {
          this.ordersSignal.set([]);
          this.loadingSignal.set(false);
          return;
        }

        const value = snapshot.val() as Record<string, Order>;
        const orders = Object.entries(value).map(([id, order]) => ({ ...order, id }));
        this.ordersSignal.set(orders);
        this.loadingSignal.set(false);
      });

      onCleanup(() => {
        off(ordersRef);
      });
    });
  }

  async placeCodOrders(addressId: string): Promise<CheckoutResult> {
    const user = this.authService.currentUser();
    const profile = this.authService.profile();
    const address = this.addressService.addresses().find((item) => item.id === addressId);
    const cartGroups = this.cartService.groupedBySeller();

    if (!user || !profile || profile.role !== 'buyer') {
      throw new Error('Only authenticated buyers can place COD orders.');
    }

    if (!address) {
      throw new Error('Select a delivery address before checkout.');
    }

    if (!cartGroups.length) {
      throw new Error('Your cart is empty.');
    }

    const orderIds: string[] = [];
    let totalAmount = 0;

    for (const group of cartGroups) {
      const orderRef = push(ref(this.database, 'orders'));
      const orderId = orderRef.key;

      if (!orderId) {
        throw new Error('Could not generate an order id.');
      }

      const subtotalAmount = group.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
      const now = new Date().toISOString();
      const order: Order = {
        id: orderId,
        buyerId: user.uid,
        buyerName: profile.name,
        buyerEmail: profile.email,
        buyerPhone: profile.phone,
        buyerBusinessName: profile.businessName,
        sellerId: group.sellerId,
        sellerName: group.sellerName,
        products: group.lines,
        shippingAddress: address,
        paymentType: 'cod',
        status: 'pending',
        subtotalAmount,
        gstAmount: 0,
        totalAmount: subtotalAmount,
        createdAt: now,
        updatedAt: now
      };

      for (const line of group.lines) {
        const productRef = ref(this.database, `products/${line.productId}`);
        const result = await runTransaction(productRef, (currentValue) => {
          if (!currentValue || typeof currentValue !== 'object') {
            return currentValue;
          }

          const currentProduct = currentValue as { stock: number; isAvailable: boolean; updatedAt?: string };
          if (currentProduct.stock < line.quantity) {
            return currentValue;
          }

          const nextStock = currentProduct.stock - line.quantity;
          return {
            ...currentProduct,
            stock: nextStock,
            isAvailable: nextStock > 0 && currentProduct.isAvailable,
            updatedAt: now
          };
        });

        const snapshotValue = result.snapshot.val() as { stock?: number } | null;
        if (!result.committed || !snapshotValue || typeof snapshotValue.stock !== 'number' || snapshotValue.stock < 0) {
          throw new Error(`Stock is no longer available for ${line.productName}.`);
        }
      }

      await set(ref(this.database, `orders/${orderId}`), removeUndefinedDeep(order));
      orderIds.push(orderId);
      totalAmount += order.totalAmount;
    }

    this.cartService.clear();
    return { orderIds, totalAmount: this.roundCurrency(totalAmount) };
  }

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
    await update(ref(this.database, `orders/${orderId}`), {
      status,
      updatedAt: new Date().toISOString()
    });
  }

  async generateInvoice(orderId: string): Promise<Invoice> {
    const order = this.ordersSignal().find((item) => item.id === orderId);

    if (!order) {
      throw new Error('The order could not be found for invoice generation.');
    }

    return this.createInvoiceRecord(order);
  }

  async downloadInvoicePdf(order: Order): Promise<void> {
    try {
      const invoice = this.createInvoiceRecord(order);
      const pdfBytes = await this.buildInvoicePdf(order, invoice);
      this.triggerPdfDownload(pdfBytes, invoice.fileName);
    } catch (error) {
      throw new Error(this.describeInvoiceError(error));
    }
  }

  invoiceNumberForOrder(order: Pick<Order, 'id' | 'invoiceNumber' | 'createdAt'>): string {
    if (order.invoiceNumber?.trim()) {
      return order.invoiceNumber;
    }

    const createdAt = new Date(order.createdAt);
    const year = Number.isNaN(createdAt.getTime()) ? new Date().getFullYear() : createdAt.getFullYear();
    return `INV-${year}-${order.id.slice(-6).toUpperCase()}`;
  }

  private describeInvoiceError(error: unknown): string {
    const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';

    if (message.toLowerCase().includes('signed in')) {
      return 'Sign in again and retry invoice generation.';
    }

    if (message.toLowerCase().includes('not found')) {
      return 'The order could not be found for invoice generation.';
    }

    if (message.toLowerCase().includes('download')) {
      return 'Your browser could not download the invoice PDF.';
    }

    return message || 'Could not generate the invoice PDF.';
  }

  private createInvoiceRecord(order: Order): DownloadableInvoice {
    const subtotalAmount = this.calculateSubtotal(order);
    const gstAmount = this.resolveAmount(order.gstAmount);
    const totalAmount = this.resolveAmount(order.totalAmount, this.roundCurrency(subtotalAmount + gstAmount));
    const invoiceNumber = this.invoiceNumberForOrder(order);

    return {
      id: order.invoiceId || order.id,
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      invoiceNumber,
      subtotalAmount,
      gstAmount,
      totalAmount,
      createdAt: order.updatedAt || order.createdAt,
      fileName: `${this.sanitizeFileName(invoiceNumber)}.pdf`
    };
  }

  private async buildInvoicePdf(order: Order, invoice: DownloadableInvoice): Promise<Uint8Array> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [595.28, 841.89];
    const accent = rgb(0.12, 0.46, 0.32);
    const accentLight = rgb(0.93, 0.98, 0.95);
    const inverseTextColor = rgb(1, 1, 1);
    const textColor = rgb(0.15, 0.15, 0.15);
    const mutedColor = rgb(0.45, 0.45, 0.45);
    const lineColor = rgb(0.82, 0.85, 0.82);
    const marginX = 48;
    const rightEdge = 547;
    const contentBottom = 80;
    const columns = {
      description: marginX,
      quantity: 380,
      unitPrice: 450,
      total: rightEdge
    };

    let page = pdfDoc.addPage(pageSize);
    let cursorY = this.drawInvoiceHeader(page, invoice, regularFont, boldFont, accent, inverseTextColor);
    cursorY = this.drawInvoiceSummary(page, order, invoice, cursorY, regularFont, boldFont, textColor, mutedColor, accentLight, accent, rightEdge);
    cursorY -= 16;

    const drawItemsHeader = (): void => {
      page.drawText('Line Items', { x: marginX, y: cursorY, size: 13, font: boldFont, color: textColor });
      cursorY -= 22;
      page.drawRectangle({ x: marginX, y: cursorY - 6, width: rightEdge - marginX, height: 22, color: accentLight });
      page.drawText('Description', { x: marginX + 8, y: cursorY, size: 9, font: boldFont, color: textColor });
      this.drawRightAlignedText(page, 'Qty', columns.quantity, cursorY, 9, boldFont, textColor);
      this.drawRightAlignedText(page, 'Rate', columns.unitPrice, cursorY, 9, boldFont, textColor);
      this.drawRightAlignedText(page, 'Amount', columns.total - 4, cursorY, 9, boldFont, textColor);
      cursorY -= 20;
    };

    const startNewPage = (): void => {
      page = pdfDoc.addPage(pageSize);
      cursorY = this.drawInvoiceHeader(page, invoice, regularFont, boldFont, accent, inverseTextColor, true);
      drawItemsHeader();
    };

    drawItemsHeader();

    for (const line of order.products) {
      const descriptionLines = this.wrapPdfText(`${line.productName} (${line.unitLabel})`, 280, regularFont, 10);
      const rowHeight = Math.max(descriptionLines.length * 14, 14) + 10;

      if (cursorY - rowHeight < contentBottom) {
        startNewPage();
      }

      let descriptionY = cursorY;
      for (const text of descriptionLines) {
        page.drawText(text, { x: columns.description + 8, y: descriptionY, size: 10, font: regularFont, color: textColor });
        descriptionY -= 14;
      }

      this.drawRightAlignedText(page, String(line.quantity), columns.quantity, cursorY, 10, regularFont, textColor);
      this.drawRightAlignedText(page, this.formatCurrency(line.price), columns.unitPrice, cursorY, 10, regularFont, mutedColor);
      this.drawRightAlignedText(page, this.formatCurrency(line.price * line.quantity), columns.total - 4, cursorY, 10, boldFont, textColor);
      cursorY -= rowHeight;
      page.drawLine({
        start: { x: marginX, y: cursorY + 4 },
        end: { x: rightEdge, y: cursorY + 4 },
        thickness: 0.5,
        color: lineColor
      });
    }

    if (cursorY - 100 < contentBottom) {
      startNewPage();
    }

    cursorY -= 8;
    page.drawLine({
      start: { x: columns.unitPrice - 60, y: cursorY },
      end: { x: rightEdge, y: cursorY },
      thickness: 0.8,
      color: lineColor
    });
    cursorY -= 18;
    this.drawAmountRow(page, 'Subtotal', invoice.subtotalAmount, columns.unitPrice - 60, columns.total - 4, cursorY, regularFont, regularFont, mutedColor);
    cursorY -= 18;
    this.drawAmountRow(page, 'GST', invoice.gstAmount, columns.unitPrice - 60, columns.total - 4, cursorY, regularFont, regularFont, mutedColor);
    cursorY -= 6;
    page.drawLine({
      start: { x: columns.unitPrice - 60, y: cursorY },
      end: { x: rightEdge, y: cursorY },
      thickness: 1.2,
      color: accent
    });
    cursorY -= 18;
    this.drawAmountRow(page, 'Total Due', invoice.totalAmount, columns.unitPrice - 60, columns.total - 4, cursorY, boldFont, boldFont, accent);
    cursorY -= 32;

    page.drawRectangle({ x: marginX, y: cursorY - 8, width: rightEdge - marginX, height: 26, color: accentLight });
    page.drawText('Thank you for your business.', { x: marginX + 10, y: cursorY, size: 9, font: boldFont, color: accent });

    page.drawLine({ start: { x: marginX, y: 62 }, end: { x: rightEdge, y: 62 }, thickness: 0.5, color: lineColor });
    page.drawText(`Order ID: ${order.id}`, { x: marginX, y: 48, size: 8, font: regularFont, color: mutedColor });
    this.drawRightAlignedText(page, `Generated ${this.formatInvoiceDate(invoice.createdAt)}`, rightEdge, 48, 8, regularFont, mutedColor);

    return pdfDoc.save();
  }

  private drawInvoiceHeader(
    page: PDFPage,
    invoice: DownloadableInvoice,
    font: PDFFont,
    boldFont: PDFFont,
    accent: RGB,
    inverseTextColor: RGB,
    compact = false
  ): number {
    const { width, height } = page.getSize();
    const marginX = 48;
    const rightEdge = 547;
    const bannerHeight = compact ? 60 : 74;
    const bannerY = height - bannerHeight - 36;

    page.drawRectangle({ x: marginX, y: bannerY, width: rightEdge - marginX, height: bannerHeight, color: accent, borderWidth: 0 });
    page.drawText('INVOICE', {
      x: marginX + 16,
      y: bannerY + bannerHeight - (compact ? 28 : 32),
      size: compact ? 22 : 26,
      font: boldFont,
      color: inverseTextColor
    });
    page.drawText('InvoiceHub B2B', {
      x: marginX + 16,
      y: bannerY + 12,
      size: 9,
      font,
      color: inverseTextColor
    });
    this.drawRightAlignedText(page, invoice.invoiceNumber, rightEdge - 16, bannerY + bannerHeight - (compact ? 28 : 32), compact ? 12 : 14, boldFont, inverseTextColor);
    this.drawRightAlignedText(page, this.formatInvoiceDate(invoice.createdAt), rightEdge - 16, bannerY + 12, 9, font, inverseTextColor);

    return bannerY - 20;
  }

  private drawInvoiceSummary(
    page: PDFPage,
    order: Order,
    invoice: DownloadableInvoice,
    y: number,
    font: PDFFont,
    boldFont: PDFFont,
    textColor: RGB,
    mutedColor: RGB,
    accentLight: RGB,
    accent: RGB,
    rightEdge: number
  ): number {
    const marginX = 48;
    const colWidth = (rightEdge - marginX - 16) / 2;

    const leftHeight = this.drawInfoBlock(
      page,
      'FROM (Seller)',
      [order.sellerName, `Payment: ${String(order.paymentType).toUpperCase()}`, `Status: ${String(order.status).toUpperCase()}`],
      marginX,
      y,
      colWidth,
      font,
      boldFont,
      textColor,
      mutedColor
    );
    const rightHeight = this.drawInfoBlock(
      page,
      'TO (Buyer)',
      [order.buyerBusinessName || order.buyerName, order.buyerEmail, order.buyerPhone || 'Phone not provided'],
      marginX + colWidth + 16,
      y,
      colWidth,
      font,
      boldFont,
      textColor,
      mutedColor
    );
    const deliveryY = y - Math.max(leftHeight, rightHeight) - 10;
    const deliveryHeight = this.drawInfoBlock(
      page,
      'Ship To',
      [order.shippingAddress.contactName, order.shippingAddress.phone, this.formatAddress(order.shippingAddress)],
      marginX,
      deliveryY,
      rightEdge - marginX,
      font,
      boldFont,
      textColor,
      mutedColor
    );
    const totalsY = deliveryY - deliveryHeight - 8;

    page.drawRectangle({ x: marginX, y: totalsY - 8, width: rightEdge - marginX, height: 24, color: accentLight });
    page.drawText(`${order.products.length} item${order.products.length === 1 ? '' : 's'}`, { x: marginX + 10, y: totalsY, size: 10, font: boldFont, color: textColor });
    this.drawRightAlignedText(page, `Grand Total: ${this.formatCurrency(invoice.totalAmount)}`, rightEdge - 10, totalsY, 10, boldFont, accent);

    return totalsY - 18;
  }

  private drawInfoBlock(
    page: PDFPage,
    label: string,
    lines: string[],
    x: number,
    y: number,
    width: number,
    font: PDFFont,
    boldFont: PDFFont,
    textColor: RGB,
    mutedColor: RGB
  ): number {
    page.drawText(label.toUpperCase(), { x, y, size: 8, font: boldFont, color: mutedColor });

    let cursorY = y - 16;

    for (const value of lines.filter(Boolean)) {
      for (const line of this.wrapPdfText(value, width, font, 10)) {
        page.drawText(line, { x, y: cursorY, size: 10, font, color: textColor });
        cursorY -= 13;
      }

      cursorY -= 4;
    }

    return y - cursorY;
  }

  private drawAmountRow(
    page: PDFPage,
    label: string,
    amount: number,
    x: number,
    rightX: number,
    y: number,
    labelFont: PDFFont,
    valueFont: PDFFont,
    textColor: RGB
  ): void {
    page.drawText(label, { x, y, size: 11, font: labelFont, color: textColor });
    this.drawRightAlignedText(page, this.formatCurrency(amount), rightX, y, 11, valueFont, textColor);
  }

  private drawRightAlignedText(
    page: PDFPage,
    text: string,
    rightX: number,
    y: number,
    size: number,
    font: PDFFont,
    color: RGB
  ): void {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: rightX - width, y, size, font, color });
  }

  private wrapPdfText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
    const normalized = text.trim().replace(/\s+/g, ' ');

    if (!normalized) {
      return ['-'];
    }

    const words = normalized.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
        continue;
      }

      let remaining = word;
      while (font.widthOfTextAtSize(remaining, fontSize) > maxWidth && remaining.length > 1) {
        let sliceLength = remaining.length - 1;

        while (sliceLength > 1 && font.widthOfTextAtSize(`${remaining.slice(0, sliceLength)}-`, fontSize) > maxWidth) {
          sliceLength -= 1;
        }

        lines.push(`${remaining.slice(0, sliceLength)}-`);
        remaining = remaining.slice(sliceLength);
      }

      currentLine = remaining;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  private triggerPdfDownload(pdfBytes: Uint8Array, fileName: string): void {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = blobUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  }

  private calculateSubtotal(order: Order): number {
    return this.roundCurrency(order.products.reduce((sum, line) => sum + line.price * line.quantity, 0));
  }

  private resolveAmount(value: number | undefined, fallback = 0): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return this.roundCurrency(fallback);
    }

    return this.roundCurrency(value);
  }

  private formatCurrency(amount: number): string {
    return this.currencyFormatter.format(this.roundCurrency(amount)).replace('₹', 'Rs.');
  }

  private formatInvoiceDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return this.dateFormatter.format(new Date());
    }

    return this.dateFormatter.format(date);
  }

  private formatAddress(address: Order['shippingAddress']): string {
    return [address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(', ');
  }

  private sanitizeFileName(value: string): string {
    return value.replace(/[^a-zA-Z0-9-_]/g, '-');
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Database, off, onValue, push, ref, runTransaction, set, update } from '@angular/fire/database';

import { AuthService } from '../auth/auth.service';
import { AddressService } from './address.service';
import { CartService } from './cart.service';
import { removeUndefinedDeep } from './firebase-data.util';
import { CheckoutResult, Invoice, Order } from '../models/commerce.models';

interface GenerateInvoiceResponse extends Invoice {
  pdfUrl: string;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly database = inject(Database);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly addressService = inject(AddressService);
  private readonly ordersSignal = signal<Order[]>([]);
  private readonly invoicesSignal = signal<Invoice[]>([]);
  private readonly loadingSignal = signal(false);

  readonly orders = this.ordersSignal.asReadonly();
  readonly invoices = this.invoicesSignal.asReadonly();
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
        this.invoicesSignal.set([]);
        this.loadingSignal.set(false);
        return;
      }

      const ordersRef = ref(this.database, 'orders');
      const invoicesRef = ref(this.database, 'invoices');
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

      onValue(invoicesRef, (snapshot) => {
        if (!snapshot.exists()) {
          this.invoicesSignal.set([]);
          return;
        }

        const value = snapshot.val() as Record<string, Invoice>;
        const invoices = Object.entries(value).map(([id, invoice]) => ({ ...invoice, id }));
        this.invoicesSignal.set(invoices);
      });

      onCleanup(() => {
        off(ordersRef);
        off(invoicesRef);
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
      totalAmount += subtotalAmount;

      try {
        await this.generateInvoice(orderId);
      } catch {
        // Orders remain valid even if invoice generation needs a retry from the order screen.
      }
    }

    this.cartService.clear();
    return { orderIds, totalAmount };
  }

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
    await update(ref(this.database, `orders/${orderId}`), {
      status,
      updatedAt: new Date().toISOString()
    });
  }

  async generateInvoice(orderId: string): Promise<GenerateInvoiceResponse> {
    try {
      const currentUser = this.authService.currentUser();

      if (!currentUser) {
        throw new Error('You must be signed in to generate an invoice.');
      }

      const idToken = await currentUser.getIdToken();
      const response = await fetch(this.invoiceApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ orderId })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } & Partial<GenerateInvoiceResponse> | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not generate the invoice PDF.');
      }

      return payload as GenerateInvoiceResponse;
    } catch (error) {
      throw new Error(this.describeInvoiceError(error));
    }
  }

  async ensureInvoice(order: Order): Promise<GenerateInvoiceResponse> {
    if (order.invoiceUrl) {
      return {
        id: order.invoiceId || order.id,
        orderId: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        invoiceNumber: order.invoiceNumber || `INV-${order.id.slice(-6).toUpperCase()}`,
        subtotalAmount: order.subtotalAmount,
        gstAmount: order.gstAmount,
        totalAmount: order.totalAmount,
        pdfUrl: order.invoiceUrl,
        createdAt: order.updatedAt
      };
    }

    return this.generateInvoice(order.id);
  }

  async downloadInvoicePdf(order: Order): Promise<void> {
    const invoice = await this.ensureInvoice(order);
    const response = await fetch(invoice.pdfUrl);

    if (!response.ok) {
      throw new Error('Could not download the invoice PDF.');
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeInvoiceNumber = (invoice.invoiceNumber || order.id).replace(/[^a-zA-Z0-9-_]/g, '-');

    anchor.href = blobUrl;
    anchor.download = `${safeInvoiceNumber}.pdf`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
  }

  private describeInvoiceError(error: unknown): string {
    const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';

    if (message.toLowerCase().includes('signed in')) {
      return 'Sign in again and retry invoice generation.';
    }

    if (message.toLowerCase().includes('not found')) {
      return 'The order could not be found for invoice generation.';
    }

    if (message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('forbidden')) {
      return 'You are not allowed to generate an invoice for this order.';
    }

    if (message.toLowerCase().includes('vercel api') || message.toLowerCase().includes('storage')) {
      return 'Invoice generation failed in the Vercel API route. Verify Vercel environment variables for Firebase Admin and Storage.';
    }

    return message || 'Could not generate the invoice PDF.';
  }

  private invoiceApiUrl(): string {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return 'http://localhost:3000/api/generate-invoice';
    }

    return '/api/generate-invoice';
  }

  invoiceForOrder(orderId: string): Invoice | undefined {
    return this.invoicesSignal().find((invoice) => invoice.orderId === orderId || invoice.id === orderId);
  }
}
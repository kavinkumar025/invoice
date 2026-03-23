import { Injectable, computed, signal } from '@angular/core';

import { CartLine, Product } from '../models/commerce.models';

const CART_STORAGE_KEY = 'invoicehub-cart';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly linesSignal = signal<CartLine[]>(this.readStoredCart());

  readonly lines = this.linesSignal.asReadonly();
  readonly totalItems = computed(() => this.linesSignal().reduce((sum, line) => sum + line.quantity, 0));
  readonly totalAmount = computed(() => this.linesSignal().reduce((sum, line) => sum + line.price * line.quantity, 0));
  readonly groupedBySeller = computed(() => {
    const groups = new Map<string, { sellerName: string; lines: CartLine[]; totalAmount: number }>();

    for (const line of this.linesSignal()) {
      const existing = groups.get(line.sellerId);
      if (existing) {
        existing.lines.push(line);
        existing.totalAmount += line.price * line.quantity;
        continue;
      }

      groups.set(line.sellerId, {
        sellerName: line.sellerName,
        lines: [line],
        totalAmount: line.price * line.quantity
      });
    }

    return Array.from(groups.entries()).map(([sellerId, group]) => ({ sellerId, ...group }));
  });

  addProduct(product: Product, quantity = 1): void {
    const unitLabel = product.unit === 'custom' ? product.customUnitLabel || 'unit' : product.unit;
    const nextLines = [...this.linesSignal()];
    const existingIndex = nextLines.findIndex((line) => line.productId === product.id);

    if (existingIndex >= 0) {
      const existing = nextLines[existingIndex];
      nextLines[existingIndex] = {
        ...existing,
        quantity: Math.min(existing.quantity + quantity, product.stock)
      };
      this.persist(nextLines);
      return;
    }

    nextLines.push({
      productId: product.id,
      productName: product.name,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      quantity: Math.min(quantity, product.stock),
      unit: product.unit,
      unitLabel,
      price: product.price,
      imageUrl: product.imageUrl
    });

    this.persist(nextLines);
  }

  updateQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }

    const nextLines = this.linesSignal().map((line) => (line.productId === productId ? { ...line, quantity } : line));
    this.persist(nextLines);
  }

  remove(productId: string): void {
    this.persist(this.linesSignal().filter((line) => line.productId !== productId));
  }

  clear(): void {
    this.persist([]);
  }

  private persist(lines: CartLine[]): void {
    this.linesSignal.set(lines);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    }
  }

  private readStoredCart(): CartLine[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    try {
      return JSON.parse(stored) as CartLine[];
    } catch {
      return [];
    }
  }
}
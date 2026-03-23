import { Injectable, computed, inject, signal } from '@angular/core';
import { Database, onValue, push, ref, remove, set, update } from '@angular/fire/database';

import { AuthService } from '../auth/auth.service';
import { Product, ProductDraft } from '../models/commerce.models';
import { removeUndefinedDeep } from './firebase-data.util';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly database = inject(Database);
  private readonly authService = inject(AuthService);
  private readonly productsSignal = signal<Product[]>([]);
  private readonly loadingSignal = signal(true);

  readonly products = this.productsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly availableProducts = computed(() =>
    this.productsSignal()
      .filter((product) => product.isAvailable && product.stock > 0)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  );
  readonly sellerProducts = computed(() => {
    const sellerId = this.authService.currentUser()?.uid;
    return this.productsSignal()
      .filter((product) => product.sellerId === sellerId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });

  productById(productId: string): Product | undefined {
    return this.productsSignal().find((product) => product.id === productId);
  }

  constructor() {
    onValue(ref(this.database, 'products'), (snapshot) => {
      if (!snapshot.exists()) {
        this.productsSignal.set([]);
        this.loadingSignal.set(false);
        return;
      }

      const value = snapshot.val() as Record<string, Product>;
      const products = Object.entries(value).map(([id, product]) => ({ ...product, id }));

      this.productsSignal.set(products);
      this.loadingSignal.set(false);
    });
  }

  async createProduct(draft: ProductDraft): Promise<void> {
    const currentUser = this.authService.currentUser();
    const profile = this.authService.profile();

    if (!currentUser || !profile) {
      throw new Error('Only authenticated sellers can create products.');
    }

    const newProductRef = push(ref(this.database, 'products'));
    const productId = newProductRef.key;

    if (!productId) {
      throw new Error('Could not generate a product id.');
    }

    const now = new Date().toISOString();

    const product: Product = {
      id: productId,
      sellerId: currentUser.uid,
      sellerName: profile.businessName ?? profile.name,
      name: draft.name,
      category: draft.category,
      description: draft.description,
      price: draft.price,
      unit: draft.unit,
      customUnitLabel: draft.customUnitLabel,
      imageUrl: draft.imageUrl,
      stock: draft.stock,
      isAvailable: draft.stock > 0,
      createdAt: now,
      updatedAt: now
    };

    await set(ref(this.database, `products/${productId}`), removeUndefinedDeep(product));
  }

  async deleteProduct(productId: string): Promise<void> {
    await remove(ref(this.database, `products/${productId}`));
  }

  async updateAvailability(productId: string, isAvailable: boolean): Promise<void> {
    await update(ref(this.database, `products/${productId}`), {
      isAvailable,
      updatedAt: new Date().toISOString()
    });
  }
}
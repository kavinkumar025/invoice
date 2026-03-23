export type UserRole = 'seller' | 'buyer';

export type UnitCode = 'kg' | 'liter' | 'piece' | 'custom';

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

export interface Address {
  id: string;
  label: string;
  contactName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

export interface AddressDraft {
  id?: string;
  label: string;
  contactName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault?: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  businessName?: string;
  defaultAddressId?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  sellerId: string;
  sellerName: string;
  name: string;
  category: string;
  description?: string;
  price: number;
  unit: UnitCode;
  customUnitLabel?: string;
  imageUrl?: string;
  stock: number;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartLine {
  productId: string;
  productName: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
  unit: UnitCode;
  unitLabel: string;
  price: number;
  imageUrl?: string;
}

export interface Order {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  buyerBusinessName?: string;
  sellerId: string;
  sellerName: string;
  products: CartLine[];
  shippingAddress: Address;
  paymentType: 'cod' | 'online';
  status: OrderStatus;
  subtotalAmount: number;
  gstAmount: number;
  totalAmount: number;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  invoiceNumber: string;
  subtotalAmount: number;
  gstAmount: number;
  totalAmount: number;
  pdfUrl?: string;
  createdAt: string;
}

export interface ProductDraft {
  name: string;
  category: string;
  description?: string;
  price: number;
  unit: UnitCode;
  customUnitLabel?: string;
  stock: number;
  imageUrl?: string;
}

export interface CheckoutResult {
  orderIds: string[];
  totalAmount: number;
}

export const unitOptions: Array<{ value: UnitCode; label: string }> = [
  { value: 'kg', label: 'Kg' },
  { value: 'liter', label: 'Liter' },
  { value: 'piece', label: 'Piece' },
  { value: 'custom', label: 'Custom unit' }
];
export type UserRole = 'seller' | 'buyer';

export type UnitCode = 'kg' | 'liter' | 'piece' | 'custom';

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface SavedLocation {
  label?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  coordinates: GeoCoordinates;
  source: 'browser' | 'manual';
  updatedAt: string;
}

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
  coordinates?: GeoCoordinates;
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
  coordinates?: GeoCoordinates;
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
  location?: SavedLocation;
  rating?: number;
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

export type ExpenseCategory =
  | 'salary'
  | 'raw_material'
  | 'rent_utilities'
  | 'marketing'
  | 'transport'
  | 'insurance'
  | 'equipment'
  | 'miscellaneous';

export const expenseCategoryOptions: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'salary', label: 'Salary' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'rent_utilities', label: 'Rent & Utilities' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'transport', label: 'Transport' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'miscellaneous', label: 'Miscellaneous' }
];

export interface InvestmentEntry {
  id: string;
  investorName: string;
  amount: number;
  date: string;
  notes?: string;
}

export interface ExpenseEntry {
  id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  date: string;
  recurring: boolean;
}

export interface LoanEntry {
  id: string;
  lender: string;
  principalAmount: number;
  interestRate: number;
  tenureMonths: number;
  emiAmount: number;
  startDate: string;
  notes?: string;
}

export interface BusinessProfile {
  investments: Record<string, InvestmentEntry>;
  expenses: Record<string, ExpenseEntry>;
  loans: Record<string, LoanEntry>;
}
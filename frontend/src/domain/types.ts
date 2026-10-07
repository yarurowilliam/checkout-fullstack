export interface Product {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  stock: number;
  imageUrl: string;
}

export interface Fees {
  baseFeeInCents: number;
  deliveryFeeInCents: number;
}

export interface CustomerData {
  fullName: string;
  email: string;
  phone: string;
}

export interface DeliveryData {
  address: string;
  city: string;
  region: string;
  postalCode: string;
}

export type TransactionStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED';

export interface Transaction {
  id: string;
  reference: string;
  productId: string;
  quantity: number;
  amountInCents: number;
  baseFeeInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
  status: TransactionStatus;
  gatewayTransactionId: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  delivery: DeliveryData & { status: string };
}

/** Datos de la tarjeta que se pueden conservar: nunca el número completo ni el CVC. */
export interface CardSummary {
  brand: string;
  lastFour: string;
  holder: string;
  installments: number;
}

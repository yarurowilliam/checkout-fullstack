export type TransactionStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED';
export type DeliveryStatus = 'PENDING' | 'ASSIGNED' | 'CANCELLED' | 'OUT_OF_STOCK';

export const FINAL_STATUSES: TransactionStatus[] = ['APPROVED', 'DECLINED', 'ERROR', 'VOIDED'];

export interface Customer {
  id: string;
  email: string;
  fullName: string;
  phone: string;
}

export interface Delivery {
  id: string;
  address: string;
  city: string;
  region: string;
  postalCode: string | null;
  status: DeliveryStatus;
}

export type DeliveryInput = Omit<Delivery, 'id' | 'status' | 'postalCode'> & { postalCode?: string | null };

export interface Transaction {
  id: string;
  reference: string;
  productId: string;
  customer: Customer;
  delivery: Delivery;
  quantity: number;
  amountInCents: number;
  taxInCents: number;
  baseFeeInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
  status: TransactionStatus;
  gatewayTransactionId: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  createdAt: Date;
}

export interface Fees {
  baseFeeInCents: number;
  deliveryFeeInCents: number;
}

/** IVA vigente: 19% sobre el valor de los productos. */
export const IVA_RATE = 0.19;

export const calculateTax = (amountInCents: number) => Math.round(amountInCents * IVA_RATE);

export const calculateAmounts = (priceInCents: number, quantity: number, fees: Fees) => {
  const amountInCents = priceInCents * quantity;
  const taxInCents = calculateTax(amountInCents);
  return {
    amountInCents,
    taxInCents,
    ...fees,
    totalInCents: amountInCents + taxInCents + fees.baseFeeInCents + fees.deliveryFeeInCents,
  };
};

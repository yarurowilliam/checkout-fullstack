import { config } from '../runtime-config';
import type { CustomerData, DeliveryData, Fees, Product, Transaction } from '../domain/types';
import { requestJson } from './http';

const url = (path: string) => `${config.apiUrl}${path}`;

export interface PaymentPayload {
  cardToken: string;
  installments: number;
  acceptanceToken: string;
  acceptPersonalAuth: string;
}

export const backend = {
  products: () => requestJson<Product[]>(url('/products'), {}, { retries: 2 }),

  fees: () => requestJson<Fees>(url('/checkout/fees'), {}, { retries: 2 }),

  createTransaction: (body: { productId: string; quantity: number; customer: CustomerData; delivery: DeliveryData }) =>
    requestJson<Transaction>(url('/transactions'), {
      method: 'POST',
      body: JSON.stringify({ ...body, delivery: { ...body.delivery, postalCode: body.delivery.postalCode || undefined } }),
    }),

  pay: (id: string, body: PaymentPayload) =>
    requestJson<Transaction>(url(`/transactions/${id}/payment`), { method: 'POST', body: JSON.stringify(body) }),

  transaction: (id: string) => requestJson<Transaction>(url(`/transactions/${id}`), {}, { retries: 2 }),
};

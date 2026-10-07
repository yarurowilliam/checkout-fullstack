import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactElement } from 'react';
import type { Product, Transaction } from '../domain/types';
import { createStore } from '../store';
import type { ThunkExtra } from '../store/thunk';

export const product: Product = {
  id: 'p1',
  name: 'Audífonos',
  description: 'Bluetooth',
  priceInCents: 18990000,
  stock: 3,
  imageUrl: '/products/headphones.svg',
};

export const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  reference: 'TX-1',
  productId: 'p1',
  quantity: 1,
  amountInCents: 18990000,
  baseFeeInCents: 200000,
  deliveryFeeInCents: 800000,
  totalInCents: 19990000,
  status: 'PENDING',
  gatewayTransactionId: null,
  cardBrand: null,
  cardLastFour: null,
  delivery: { address: 'Calle 1', city: 'Bogotá', region: 'Cund', postalCode: '', status: 'PENDING' },
  ...overrides,
});

export const acceptance = {
  acceptanceToken: 'acc',
  acceptPersonalAuth: 'per',
  termsUrl: 'https://terms',
  personalDataUrl: 'https://data',
};

export const fakeExtra = () =>
  ({
    backend: {
      products: jest.fn().mockResolvedValue([product]),
      fees: jest.fn().mockResolvedValue({ baseFeeInCents: 200000, deliveryFeeInCents: 800000 }),
      createTransaction: jest.fn().mockResolvedValue(transaction()),
      pay: jest.fn().mockResolvedValue(
        transaction({ status: 'APPROVED', gatewayTransactionId: 'g1', cardBrand: 'VISA', cardLastFour: '4242' }),
      ),
      transaction: jest.fn().mockResolvedValue(transaction()),
    },
    gateway: {
      tokenizeCard: jest.fn().mockResolvedValue({ id: 'tok_1', brand: 'VISA', lastFour: '4242' }),
      acceptance: jest.fn().mockResolvedValue(acceptance),
    },
  }) satisfies { [K in keyof ThunkExtra]: Record<keyof ThunkExtra[K], jest.Mock> };

export const renderWithStore = (ui: ReactElement, extra = fakeExtra()) => {
  const store = createStore(extra as unknown as ThunkExtra);
  return { store, extra, ...render(<Provider store={store}>{ui}</Provider>) };
};

import { PaymentGateway } from '../domain/ports/payment-gateway';
import { ProductRepository } from '../domain/ports/product.repository';
import { TransactionRepository } from '../domain/ports/transaction.repository';
import { Product } from '../domain/product';
import { Transaction } from '../domain/transaction';
import { err, ok } from '../shared/result';
import { CreateTransactionInput, PayInput, TransactionsUseCases } from './transactions.use-cases';

const product: Product = { id: 'p1', name: 'Reloj', description: 'd', priceInCents: 100000, stock: 5, imageUrl: 'u' };

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  reference: 'TX-1',
  productId: 'p1',
  customer: { id: 'c1', email: 'a@b.co', fullName: 'Ana', phone: '3001234567' },
  delivery: { id: 'd1', address: 'Calle 1', city: 'Bogotá', region: 'Cund', postalCode: null, status: 'PENDING' },
  quantity: 2,
  amountInCents: 200000,
  baseFeeInCents: 2000,
  deliveryFeeInCents: 8000,
  totalInCents: 210000,
  status: 'PENDING',
  gatewayTransactionId: null,
  cardBrand: null,
  cardLastFour: null,
  createdAt: new Date(),
  ...overrides,
});

const input: CreateTransactionInput = {
  productId: 'p1',
  quantity: 2,
  customer: { email: 'a@b.co', fullName: 'Ana', phone: '3001234567' },
  delivery: { address: 'Calle 1', city: 'Bogotá', region: 'Cund' },
};

const payInput: PayInput = { cardToken: 'tok_1', installments: 1, acceptanceToken: 'acc', acceptPersonalAuth: 'per' };
const approved = { id: 'g1', status: 'APPROVED' as const, cardBrand: 'VISA', cardLastFour: '4242' };

describe('TransactionsUseCases', () => {
  let products: jest.Mocked<ProductRepository>;
  let transactions: jest.Mocked<TransactionRepository>;
  let gateway: jest.Mocked<PaymentGateway>;
  let useCases: TransactionsUseCases;

  beforeEach(() => {
    products = { findAll: jest.fn(), findById: jest.fn().mockResolvedValue(product) };
    transactions = {
      create: jest.fn().mockImplementation(async (data) => tx(data)),
      findById: jest.fn().mockResolvedValue(tx()),
      setGatewayId: jest.fn(),
      finalize: jest.fn().mockImplementation(async (_id, outcome) => tx(outcome)),
    };
    gateway = { createPayment: jest.fn(), getPayment: jest.fn() };
    const fees = { baseFeeInCents: 2000, deliveryFeeInCents: 8000 };
    useCases = new TransactionsUseCases(products, transactions, gateway, { fees, pollAttempts: 2, pollIntervalMs: 0 });
  });

  it('expone las tarifas configuradas', () => {
    expect(useCases.fees()).toEqual({ baseFeeInCents: 2000, deliveryFeeInCents: 8000 });
  });

  describe('create', () => {
    it('crea la transacción PENDING con los montos calculados', async () => {
      const result = await useCases.create(input);
      expect(result.ok).toBe(true);
      const data = transactions.create.mock.calls[0][0];
      expect(data).toMatchObject({ amountInCents: 200000, baseFeeInCents: 2000, deliveryFeeInCents: 8000, totalInCents: 210000 });
      expect(data.reference).toMatch(/^TX-\d+-[0-9a-f]{8}$/);
    });

    it('falla si el producto no existe', async () => {
      products.findById.mockResolvedValue(null);
      expect(await useCases.create(input)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    });

    it('falla si no hay stock suficiente', async () => {
      products.findById.mockResolvedValue({ ...product, stock: 1 });
      expect(await useCases.create(input)).toMatchObject({ ok: false, error: { code: 'OUT_OF_STOCK' } });
      expect(transactions.create).not.toHaveBeenCalled();
    });
  });

  describe('pay', () => {
    it('cobra el total, guarda el id de la pasarela y finaliza si queda aprobada', async () => {
      gateway.createPayment.mockResolvedValue(ok(approved));
      const result = await useCases.pay('t1', payInput);
      expect(gateway.createPayment).toHaveBeenCalledWith({
        reference: 'TX-1',
        amountInCents: 210000,
        customerEmail: 'a@b.co',
        ...payInput,
      });
      expect(transactions.setGatewayId).toHaveBeenCalledWith('t1', 'g1');
      expect(transactions.finalize).toHaveBeenCalledWith('t1', { status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242' });
      expect(result).toMatchObject({ ok: true, value: { status: 'APPROVED' } });
    });

    it('consulta la pasarela mientras el pago siga PENDING', async () => {
      gateway.createPayment.mockResolvedValue(ok({ ...approved, status: 'PENDING' }));
      gateway.getPayment
        .mockResolvedValueOnce(err('GATEWAY', 'caída'))
        .mockResolvedValueOnce(ok({ ...approved, status: 'DECLINED' }));
      const result = await useCases.pay('t1', payInput);
      expect(gateway.getPayment).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ ok: true, value: { status: 'DECLINED' } });
    });

    it('deja la transacción PENDING si la pasarela no responde a tiempo', async () => {
      gateway.createPayment.mockResolvedValue(ok({ ...approved, status: 'PENDING' }));
      gateway.getPayment.mockResolvedValue(ok({ ...approved, status: 'PENDING' }));
      const result = await useCases.pay('t1', payInput);
      expect(transactions.finalize).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true, value: { status: 'PENDING' } });
    });

    it('marca ERROR si la pasarela rechaza la creación del pago', async () => {
      gateway.createPayment.mockResolvedValue(err('GATEWAY', 'token usado'));
      const result = await useCases.pay('t1', payInput);
      expect(transactions.finalize).toHaveBeenCalledWith('t1', { status: 'ERROR', cardBrand: null, cardLastFour: null });
      expect(result).toMatchObject({ ok: true, value: { status: 'ERROR' } });
    });

    it('rechaza pagar una transacción ya procesada', async () => {
      transactions.findById.mockResolvedValue(tx({ status: 'APPROVED' }));
      expect(await useCases.pay('t1', payInput)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
      expect(gateway.createPayment).not.toHaveBeenCalled();
    });

    it('rechaza pagar si ya se envió a la pasarela', async () => {
      transactions.findById.mockResolvedValue(tx({ gatewayTransactionId: 'g1' }));
      expect(await useCases.pay('t1', payInput)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    });

    it('no cobra si el stock se agotó desde la creación', async () => {
      products.findById.mockResolvedValue({ ...product, stock: 1 });
      expect(await useCases.pay('t1', payInput)).toMatchObject({ ok: false, error: { code: 'OUT_OF_STOCK' } });
      expect(gateway.createPayment).not.toHaveBeenCalled();
    });

    it('falla si la transacción no existe', async () => {
      transactions.findById.mockResolvedValue(null);
      expect(await useCases.pay('x', payInput)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    });
  });

  describe('get', () => {
    it('devuelve una transacción final sin consultar la pasarela', async () => {
      transactions.findById.mockResolvedValue(tx({ status: 'APPROVED', gatewayTransactionId: 'g1' }));
      expect(await useCases.get('t1')).toMatchObject({ ok: true, value: { status: 'APPROVED' } });
      expect(gateway.getPayment).not.toHaveBeenCalled();
    });

    it('devuelve una transacción PENDING sin enviar a la pasarela tal cual', async () => {
      expect(await useCases.get('t1')).toMatchObject({ ok: true, value: { status: 'PENDING' } });
      expect(gateway.getPayment).not.toHaveBeenCalled();
    });

    it('sincroniza el estado si la transacción quedó PENDING en la pasarela', async () => {
      transactions.findById.mockResolvedValue(tx({ gatewayTransactionId: 'g1' }));
      gateway.getPayment.mockResolvedValue(ok(approved));
      expect(await useCases.get('t1')).toMatchObject({ ok: true, value: { status: 'APPROVED' } });
    });

    it('mantiene PENDING si la pasarela falla al sincronizar', async () => {
      transactions.findById.mockResolvedValue(tx({ gatewayTransactionId: 'g1' }));
      gateway.getPayment.mockResolvedValue(err('GATEWAY', 'caída'));
      expect(await useCases.get('t1')).toMatchObject({ ok: true, value: { status: 'PENDING' } });
      expect(transactions.finalize).not.toHaveBeenCalled();
    });
  });
});

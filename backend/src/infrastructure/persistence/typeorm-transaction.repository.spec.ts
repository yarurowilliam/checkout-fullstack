import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { NewTransaction } from '../../domain/ports/transaction.repository';
import { createMemoryDataSource as createDataSource } from '../../test-utils/pg-mem';
import { ProductEntity } from './entities';
import { TypeOrmTransactionRepository } from './typeorm-transaction.repository';

describe('TypeOrmTransactionRepository (pg-mem)', () => {
  let ds: DataSource;
  let repo: TypeOrmTransactionRepository;
  let product: ProductEntity;

  const newTx = (overrides: Partial<NewTransaction> = {}): NewTransaction => ({
    reference: `REF-${randomUUID()}`,
    productId: product.id,
    customer: { email: 'ana@test.co', fullName: 'Ana', phone: '3001234567' },
    delivery: { address: 'Calle 1', city: 'Bogotá', region: 'Cund' },
    quantity: 2,
    amountInCents: 200000,
    baseFeeInCents: 2000,
    deliveryFeeInCents: 8000,
    totalInCents: 210000,
    ...overrides,
  });

  const stock = async () => (await ds.getRepository(ProductEntity).findOneByOrFail({ id: product.id })).stock;

  beforeEach(async () => {
    ds = await createDataSource();
    repo = new TypeOrmTransactionRepository(ds);
    product = await ds.getRepository(ProductEntity).save({
      name: 'Reloj',
      description: 'd',
      priceInCents: 100000,
      stock: 3,
      imageUrl: 'u',
    });
  });

  afterEach(() => ds.destroy());

  it('crea la transacción PENDING con su cliente y su entrega', async () => {
    const tx = await repo.create(newTx({ delivery: { address: 'Calle 1', city: 'Bogotá', region: 'Cund', postalCode: '110111' } }));
    expect(tx).toMatchObject({
      status: 'PENDING',
      productId: product.id,
      totalInCents: 210000,
      customer: { email: 'ana@test.co', fullName: 'Ana' },
      delivery: { status: 'PENDING', postalCode: '110111' },
    });
  });

  it('reutiliza el cliente por email y actualiza sus datos', async () => {
    const first = await repo.create(newTx());
    const second = await repo.create(newTx({ customer: { email: 'ana@test.co', fullName: 'Ana María', phone: '3110000000' } }));
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.customer.fullName).toBe('Ana María');
  });

  it('devuelve null si la transacción no existe', async () => {
    expect(await repo.findById(randomUUID())).toBeNull();
  });

  it('guarda el id de la pasarela', async () => {
    const tx = await repo.create(newTx());
    await repo.setGatewayId(tx.id, 'g-1');
    expect((await repo.findById(tx.id))?.gatewayTransactionId).toBe('g-1');
  });

  it('al aprobar descuenta el stock y asigna la entrega', async () => {
    const tx = await repo.create(newTx());
    const done = await repo.finalize(tx.id, { status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242' });
    expect(done).toMatchObject({ status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242', delivery: { status: 'ASSIGNED' } });
    expect(await stock()).toBe(1);
  });

  it('es idempotente: finalizar dos veces no descuenta el stock dos veces', async () => {
    const tx = await repo.create(newTx());
    await repo.finalize(tx.id, { status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242' });
    const again = await repo.finalize(tx.id, { status: 'DECLINED', cardBrand: null, cardLastFour: null });
    expect(again.status).toBe('APPROVED');
    expect(await stock()).toBe(1);
  });

  it('al declinar cancela la entrega sin tocar el stock', async () => {
    const tx = await repo.create(newTx());
    const done = await repo.finalize(tx.id, { status: 'DECLINED', cardBrand: 'VISA', cardLastFour: '1111' });
    expect(done.delivery.status).toBe('CANCELLED');
    expect(await stock()).toBe(3);
  });

  it('marca la entrega OUT_OF_STOCK si el stock se agotó antes de aprobar', async () => {
    const tx = await repo.create(newTx({ quantity: 5 }));
    const done = await repo.finalize(tx.id, { status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242' });
    expect(done.delivery.status).toBe('OUT_OF_STOCK');
    expect(await stock()).toBe(3);
  });
});

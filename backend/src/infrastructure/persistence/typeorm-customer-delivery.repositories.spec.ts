import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMemoryDataSource } from '../../test-utils/pg-mem';
import { ProductEntity } from './entities';
import { TypeOrmCustomerRepository, TypeOrmDeliveryRepository } from './typeorm-customer-delivery.repositories';
import { TypeOrmTransactionRepository } from './typeorm-transaction.repository';

describe('Repositorios de clientes y entregas (pg-mem)', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = await createMemoryDataSource();
  });

  afterEach(() => ds.destroy());

  const createTransaction = async () => {
    const product = await ds.getRepository(ProductEntity).save({ name: 'Reloj', description: 'd', priceInCents: 100, stock: 3, imageUrl: 'u' });
    return new TypeOrmTransactionRepository(ds).create({
      reference: `REF-${randomUUID()}`,
      productId: product.id,
      customer: { email: 'ana@test.co', fullName: 'Ana', phone: '3001234567' },
      delivery: { address: 'Calle 1', city: 'Bogotá', region: 'Cund', postalCode: '110111' },
      quantity: 1,
      amountInCents: 100,
      baseFeeInCents: 10,
      deliveryFeeInCents: 20,
      totalInCents: 130,
    });
  };

  it('busca el cliente por id', async () => {
    const tx = await createTransaction();
    const repo = new TypeOrmCustomerRepository(ds);
    expect(await repo.findById(tx.customer.id)).toEqual({ id: tx.customer.id, email: 'ana@test.co', fullName: 'Ana', phone: '3001234567' });
    expect(await repo.findById(randomUUID())).toBeNull();
  });

  it('busca la entrega por id con su transacción', async () => {
    const tx = await createTransaction();
    const repo = new TypeOrmDeliveryRepository(ds);
    expect(await repo.findById(tx.delivery.id)).toMatchObject({
      id: tx.delivery.id,
      transactionId: tx.id,
      address: 'Calle 1',
      city: 'Bogotá',
      region: 'Cund',
      postalCode: '110111',
      status: 'PENDING',
    });
    expect(await repo.findById(randomUUID())).toBeNull();
  });
});

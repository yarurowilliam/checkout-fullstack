import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, MoreThanOrEqual } from 'typeorm';
import { NewTransaction, PaymentOutcome, TransactionRepository } from '../../domain/ports/transaction.repository';
import { DeliveryStatus, Transaction, TransactionStatus } from '../../domain/transaction';
import { CustomerEntity, DeliveryEntity, ProductEntity, TransactionEntity } from './entities';

@Injectable()
export class TypeOrmTransactionRepository implements TransactionRepository {
  constructor(private readonly ds: DataSource) {}

  async create(data: NewTransaction): Promise<Transaction> {
    const id = await this.ds.transaction(async (m) => {
      const customers = m.getRepository(CustomerEntity);
      const customer = (await customers.findOneBy({ email: data.customer.email })) ?? customers.create({ email: data.customer.email });
      Object.assign(customer, { fullName: data.customer.fullName, phone: data.customer.phone });
      await customers.save(customer);

      const { customer: _c, delivery, ...fields } = data;
      const tx = await m.getRepository(TransactionEntity).save({ ...fields, customer, status: 'PENDING' });
      await m.getRepository(DeliveryEntity).save({
        ...delivery,
        postalCode: delivery.postalCode ?? null,
        transaction: tx,
        status: 'PENDING',
      });
      return tx.id;
    });
    return (await this.findById(id))!;
  }

  async findById(id: string): Promise<Transaction | null> {
    const entity = await this.ds.getRepository(TransactionEntity).findOne({
      where: { id },
      relations: { customer: true, delivery: true },
    });
    return entity && toDomain(entity);
  }

  async setGatewayId(id: string, gatewayTransactionId: string): Promise<void> {
    await this.ds.getRepository(TransactionEntity).update(id, { gatewayTransactionId });
  }

  async finalize(id: string, outcome: PaymentOutcome): Promise<Transaction> {
    await this.ds.transaction(async (m) => {
      // Solo una llamada concurrente gana la transición desde PENDING.
      const updated = await m
        .createQueryBuilder()
        .update(TransactionEntity)
        .set(outcome)
        .where('id = :id AND status = :pending', { id, pending: 'PENDING' })
        .execute();
      if (!updated.affected) return;

      const deliveryStatus = outcome.status === 'APPROVED' ? await this.takeStock(m, id) : 'CANCELLED';
      await m.getRepository(DeliveryEntity).update({ transaction: { id } }, { status: deliveryStatus });
    });
    return (await this.findById(id))!;
  }

  private async takeStock(m: EntityManager, transactionId: string): Promise<DeliveryStatus> {
    const tx = await m.getRepository(TransactionEntity).findOneByOrFail({ id: transactionId });
    const taken = await m
      .getRepository(ProductEntity)
      .decrement({ id: tx.productId, stock: MoreThanOrEqual(tx.quantity) }, 'stock', tx.quantity);
    return taken.affected ? 'ASSIGNED' : 'OUT_OF_STOCK';
  }
}

const toDomain = (e: TransactionEntity): Transaction => ({
  id: e.id,
  reference: e.reference,
  productId: e.productId,
  customer: { id: e.customer.id, email: e.customer.email, fullName: e.customer.fullName, phone: e.customer.phone },
  delivery: {
    id: e.delivery.id,
    address: e.delivery.address,
    city: e.delivery.city,
    region: e.delivery.region,
    postalCode: e.delivery.postalCode,
    status: e.delivery.status as DeliveryStatus,
  },
  quantity: e.quantity,
  amountInCents: e.amountInCents,
  baseFeeInCents: e.baseFeeInCents,
  deliveryFeeInCents: e.deliveryFeeInCents,
  totalInCents: e.totalInCents,
  status: e.status as TransactionStatus,
  gatewayTransactionId: e.gatewayTransactionId,
  cardBrand: e.cardBrand,
  cardLastFour: e.cardLastFour,
  createdAt: e.createdAt,
});

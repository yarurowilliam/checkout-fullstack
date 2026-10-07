import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CustomerRepository } from '../../domain/ports/customer.repository';
import { DeliveryDetail, DeliveryRepository } from '../../domain/ports/delivery.repository';
import { Customer, DeliveryStatus } from '../../domain/transaction';
import { CustomerEntity, DeliveryEntity } from './entities';

@Injectable()
export class TypeOrmCustomerRepository implements CustomerRepository {
  constructor(private readonly ds: DataSource) {}

  async findById(id: string): Promise<Customer | null> {
    const c = await this.ds.getRepository(CustomerEntity).findOneBy({ id });
    return c && { id: c.id, email: c.email, fullName: c.fullName, phone: c.phone };
  }
}

@Injectable()
export class TypeOrmDeliveryRepository implements DeliveryRepository {
  constructor(private readonly ds: DataSource) {}

  async findById(id: string): Promise<DeliveryDetail | null> {
    const d = await this.ds.getRepository(DeliveryEntity).findOne({ where: { id }, relations: { transaction: true } });
    return (
      d && {
        id: d.id,
        transactionId: d.transaction.id,
        address: d.address,
        city: d.city,
        region: d.region,
        postalCode: d.postalCode,
        status: d.status as DeliveryStatus,
        createdAt: d.createdAt,
      }
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { CUSTOMER_REPOSITORY, CustomerRepository } from '../domain/ports/customer.repository';
import { Customer } from '../domain/transaction';
import { fromNullable, Result } from '../shared/result';

@Injectable()
export class CustomersUseCases {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository) {}

  async get(id: string): Promise<Result<Customer>> {
    return fromNullable(await this.customers.findById(id), 'NOT_FOUND', `Cliente ${id} no encontrado`);
  }
}

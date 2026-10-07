import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomersUseCases } from '../../application/customers.use-cases';
import { DeliveriesUseCases } from '../../application/deliveries.use-cases';
import { unwrap } from './http-result';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly useCases: CustomersUseCases) {}

  /** El teléfono no se expone: el endpoint es público y solo requiere el id. */
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const { phone: _phone, ...customer } = unwrap(await this.useCases.get(id));
    return customer;
  }
}

@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly useCases: DeliveriesUseCases) {}

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return unwrap(await this.useCases.get(id));
  }
}

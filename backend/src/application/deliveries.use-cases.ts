import { Inject, Injectable } from '@nestjs/common';
import { DELIVERY_REPOSITORY, DeliveryDetail, DeliveryRepository } from '../domain/ports/delivery.repository';
import { fromNullable, Result } from '../shared/result';

@Injectable()
export class DeliveriesUseCases {
  constructor(@Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepository) {}

  async get(id: string): Promise<Result<DeliveryDetail>> {
    return fromNullable(await this.deliveries.findById(id), 'NOT_FOUND', `Entrega ${id} no encontrada`);
  }
}

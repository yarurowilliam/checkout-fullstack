import { Delivery } from '../transaction';

export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');

export interface DeliveryDetail extends Delivery {
  transactionId: string;
  createdAt: Date;
}

export interface DeliveryRepository {
  findById(id: string): Promise<DeliveryDetail | null>;
}

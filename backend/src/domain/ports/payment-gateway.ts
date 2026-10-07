import { Result } from '../../shared/result';
import { TransactionStatus } from '../transaction';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentRequest {
  reference: string;
  amountInCents: number;
  customerEmail: string;
  cardToken: string;
  installments: number;
  acceptanceToken: string;
  acceptPersonalAuth: string;
}

export interface GatewayPayment {
  id: string;
  status: TransactionStatus;
  cardBrand: string | null;
  cardLastFour: string | null;
}

export interface PaymentGateway {
  createPayment(request: PaymentRequest): Promise<Result<GatewayPayment>>;
  getPayment(id: string): Promise<Result<GatewayPayment>>;
}

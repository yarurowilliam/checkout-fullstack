import { Customer, DeliveryInput, Transaction, TransactionStatus } from '../transaction';

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');

export interface NewTransaction {
  reference: string;
  productId: string;
  customer: Omit<Customer, 'id'>;
  delivery: DeliveryInput;
  quantity: number;
  amountInCents: number;
  baseFeeInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
}

export interface PaymentOutcome {
  status: TransactionStatus;
  cardBrand: string | null;
  cardLastFour: string | null;
}

export interface TransactionRepository {
  /** Crea (o actualiza por email) el cliente, la transacción PENDING y su entrega. */
  create(data: NewTransaction): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  setGatewayId(id: string, gatewayTransactionId: string): Promise<void>;
  /**
   * Aplica el resultado del pago de forma atómica e idempotente (solo desde PENDING).
   * Si es APPROVED descuenta el stock y asigna la entrega; si no, cancela la entrega.
   */
  finalize(id: string, outcome: PaymentOutcome): Promise<Transaction>;
}

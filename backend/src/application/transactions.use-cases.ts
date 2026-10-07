import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GatewayPayment, PAYMENT_GATEWAY, PaymentGateway } from '../domain/ports/payment-gateway';
import { PRODUCT_REPOSITORY, ProductRepository } from '../domain/ports/product.repository';
import { TRANSACTION_REPOSITORY, TransactionRepository } from '../domain/ports/transaction.repository';
import { calculateAmounts, Customer, DeliveryInput, Fees, FINAL_STATUSES, Transaction } from '../domain/transaction';
import { ensure, Flow, fromNullable, ok, Result } from '../shared/result';

export const CHECKOUT_SETTINGS = Symbol('CHECKOUT_SETTINGS');

export interface CheckoutSettings {
  fees: Fees;
  /** Consultas al estado del pago antes de responder (el resto lo resuelve GET). */
  pollAttempts: number;
  pollIntervalMs: number;
}

export interface CreateTransactionInput {
  productId: string;
  quantity: number;
  customer: Omit<Customer, 'id'>;
  delivery: DeliveryInput;
}

export interface PayInput {
  cardToken: string;
  installments: number;
  acceptanceToken: string;
  acceptPersonalAuth: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class TransactionsUseCases {
  private readonly logger = new Logger(TransactionsUseCases.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(CHECKOUT_SETTINGS) private readonly settings: CheckoutSettings,
  ) {}

  fees(): Fees {
    return this.settings.fees;
  }

  create(input: CreateTransactionInput): Promise<Result<Transaction>> {
    return Flow.from(this.findProduct(input.productId))
      .andThen((product) => ensure(product, product.stock >= input.quantity, 'OUT_OF_STOCK', 'No hay unidades suficientes'))
      .map((product) =>
        this.transactions.create({
          reference: `TX-${Date.now()}-${randomUUID().slice(0, 8)}`,
          productId: product.id,
          customer: input.customer,
          delivery: input.delivery,
          quantity: input.quantity,
          ...calculateAmounts(product.priceInCents, input.quantity, this.settings.fees),
        }),
      )
      .run();
  }

  pay(id: string, input: PayInput): Promise<Result<Transaction>> {
    return Flow.from(this.findTransaction(id))
      .andThen((tx) => ensure(tx, tx.status === 'PENDING' && !tx.gatewayTransactionId, 'CONFLICT', 'La transacción ya fue procesada'))
      .andThen((tx) => this.checkStock(tx))
      .andThen((tx) => this.charge(tx, input))
      .run();
  }

  /** Devuelve la transacción; si sigue PENDING consulta la pasarela (recupera el estado tras un refresh). */
  get(id: string): Promise<Result<Transaction>> {
    return Flow.from(this.findTransaction(id))
      .andThen((tx) => (tx.status === 'PENDING' && tx.gatewayTransactionId ? this.sync(tx, tx.gatewayTransactionId) : ok(tx)))
      .run();
  }

  private async findProduct(id: string) {
    return fromNullable(await this.products.findById(id), 'NOT_FOUND', `Producto ${id} no encontrado`);
  }

  private async findTransaction(id: string) {
    return fromNullable(await this.transactions.findById(id), 'NOT_FOUND', `Transacción ${id} no encontrada`);
  }

  // ponytail: el stock se valida antes de cobrar y se descuenta al aprobar; con alta concurrencia reservar stock con expiración
  private async checkStock(tx: Transaction): Promise<Result<Transaction>> {
    return Flow.from(this.findProduct(tx.productId))
      .andThen((product) => ensure(tx, product.stock >= tx.quantity, 'OUT_OF_STOCK', 'No hay unidades suficientes'))
      .run();
  }

  private async charge(tx: Transaction, input: PayInput): Promise<Result<Transaction>> {
    const created = await this.gateway.createPayment({
      reference: tx.reference,
      amountInCents: tx.totalInCents,
      customerEmail: tx.customer.email,
      ...input,
    });
    if (!created.ok) {
      this.logger.warn(`Pago rechazado por la pasarela para ${tx.reference}: ${created.error.message}`);
      return ok(await this.transactions.finalize(tx.id, { status: 'ERROR', cardBrand: null, cardLastFour: null }));
    }
    await this.transactions.setGatewayId(tx.id, created.value.id);

    let payment = created.value;
    for (let i = 0; i < this.settings.pollAttempts && payment.status === 'PENDING'; i++) {
      await sleep(this.settings.pollIntervalMs);
      const polled = await this.gateway.getPayment(payment.id);
      if (polled.ok) payment = polled.value;
    }
    return this.applyIfFinal(tx.id, payment);
  }

  private async sync(tx: Transaction, gatewayId: string): Promise<Result<Transaction>> {
    const payment = await this.gateway.getPayment(gatewayId);
    return payment.ok ? this.applyIfFinal(tx.id, payment.value) : ok(tx);
  }

  private async applyIfFinal(id: string, payment: GatewayPayment): Promise<Result<Transaction>> {
    if (!FINAL_STATUSES.includes(payment.status)) return this.findTransaction(id);
    const { status, cardBrand, cardLastFour } = payment;
    return ok(await this.transactions.finalize(id, { status, cardBrand, cardLastFour }));
  }
}

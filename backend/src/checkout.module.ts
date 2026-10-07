import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersUseCases } from './application/customers.use-cases';
import { DeliveriesUseCases } from './application/deliveries.use-cases';
import { ProductsUseCases } from './application/products.use-cases';
import { CHECKOUT_SETTINGS, CheckoutSettings, TransactionsUseCases } from './application/transactions.use-cases';
import { CUSTOMER_REPOSITORY } from './domain/ports/customer.repository';
import { DELIVERY_REPOSITORY } from './domain/ports/delivery.repository';
import { PAYMENT_GATEWAY } from './domain/ports/payment-gateway';
import { PRODUCT_REPOSITORY } from './domain/ports/product.repository';
import { TRANSACTION_REPOSITORY } from './domain/ports/transaction.repository';
import { CardPaymentGateway } from './infrastructure/gateway/card-payment.gateway';
import { CustomersController, DeliveriesController } from './infrastructure/http/customers-deliveries.controller';
import { ProductsController } from './infrastructure/http/products.controller';
import { TransactionsController } from './infrastructure/http/transactions.controller';
import { ProductEntity } from './infrastructure/persistence/entities';
import { ProductSeeder } from './infrastructure/persistence/seed';
import { TypeOrmCustomerRepository, TypeOrmDeliveryRepository } from './infrastructure/persistence/typeorm-customer-delivery.repositories';
import { TypeOrmProductRepository } from './infrastructure/persistence/typeorm-product.repository';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/typeorm-transaction.repository';

/** Funcionalidad del checkout; la conexión a la base de datos la provee quien lo importe. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProductEntity]),
    // Límite global por IP; el pago tiene uno más estricto en el controlador.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [ProductsController, TransactionsController, CustomersController, DeliveriesController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    ProductsUseCases,
    TransactionsUseCases,
    CustomersUseCases,
    DeliveriesUseCases,
    ProductSeeder,
    { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository },
    { provide: TRANSACTION_REPOSITORY, useClass: TypeOrmTransactionRepository },
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: DELIVERY_REPOSITORY, useClass: TypeOrmDeliveryRepository },
    { provide: PAYMENT_GATEWAY, useClass: CardPaymentGateway },
    {
      provide: CHECKOUT_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CheckoutSettings => ({
        fees: {
          baseFeeInCents: Number(config.get('BASE_FEE_IN_CENTS', 200000)),
          deliveryFeeInCents: Number(config.get('DELIVERY_FEE_IN_CENTS', 800000)),
        },
        pollAttempts: Number(config.get('PAYMENT_POLL_ATTEMPTS', 5)),
        pollIntervalMs: Number(config.get('PAYMENT_POLL_INTERVAL_MS', 1000)),
      }),
    },
  ],
})
export class CheckoutModule {}

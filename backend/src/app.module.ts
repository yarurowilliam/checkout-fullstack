import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsUseCases } from './application/products.use-cases';
import { CHECKOUT_SETTINGS, CheckoutSettings, TransactionsUseCases } from './application/transactions.use-cases';
import { PAYMENT_GATEWAY } from './domain/ports/payment-gateway';
import { PRODUCT_REPOSITORY } from './domain/ports/product.repository';
import { TRANSACTION_REPOSITORY } from './domain/ports/transaction.repository';
import { CardPaymentGateway } from './infrastructure/gateway/card-payment.gateway';
import { ProductsController } from './infrastructure/http/products.controller';
import { TransactionsController } from './infrastructure/http/transactions.controller';
import { ENTITIES, ProductEntity } from './infrastructure/persistence/entities';
import { ProductSeeder } from './infrastructure/persistence/seed';
import { TypeOrmProductRepository } from './infrastructure/persistence/typeorm-product.repository';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/typeorm-transaction.repository';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: ENTITIES,
        // ponytail: synchronize en vez de migraciones; pasar a migraciones si el esquema evoluciona en producción
        synchronize: config.get('DB_SYNC') === 'true',
        ssl: config.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
    TypeOrmModule.forFeature([ProductEntity]),
    // Límite global por IP; el pago tiene uno más estricto en el controlador.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [ProductsController, TransactionsController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    ProductsUseCases,
    TransactionsUseCases,
    ProductSeeder,
    { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository },
    { provide: TRANSACTION_REPOSITORY, useClass: TypeOrmTransactionRepository },
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
export class AppModule {}

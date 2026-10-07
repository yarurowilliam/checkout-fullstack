import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsUseCases } from './application/products.use-cases';
import { PRODUCT_REPOSITORY } from './domain/ports/product.repository';
import { ProductsController } from './infrastructure/http/products.controller';
import { ENTITIES, ProductEntity } from './infrastructure/persistence/entities';
import { ProductSeeder } from './infrastructure/persistence/seed';
import { TypeOrmProductRepository } from './infrastructure/persistence/typeorm-product.repository';

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
  ],
  controllers: [ProductsController],
  providers: [ProductsUseCases, ProductSeeder, { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository }],
})
export class AppModule {}

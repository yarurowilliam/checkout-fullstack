import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutModule } from './checkout.module';
import { ENTITIES } from './infrastructure/persistence/entities';

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
    CheckoutModule,
  ],
})
export class AppModule {}

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from './entities';

export const SEED_PRODUCTS: Omit<ProductEntity, 'id'>[] = [
  {
    name: 'Audífonos inalámbricos',
    description: 'Audífonos Bluetooth con cancelación de ruido y 30 horas de batería.',
    priceInCents: 18990000,
    stock: 15,
    imageUrl: 'https://picsum.photos/seed/headphones/600/600',
  },
  {
    name: 'Reloj inteligente',
    description: 'Monitor de ritmo cardiaco, GPS y resistencia al agua 5 ATM.',
    priceInCents: 32900000,
    stock: 8,
    imageUrl: 'https://picsum.photos/seed/watch/600/600',
  },
  {
    name: 'Morral urbano',
    description: 'Morral impermeable con compartimento para portátil de 15".',
    priceInCents: 12500000,
    stock: 20,
    imageUrl: 'https://picsum.photos/seed/backpack/600/600',
  },
];

// Carga productos de ejemplo solo si la tabla está vacía.
@Injectable()
export class ProductSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductSeeder.name);

  constructor(@InjectRepository(ProductEntity) private readonly repo: Repository<ProductEntity>) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.repo.count()) > 0) return;
    await this.repo.insert(SEED_PRODUCTS);
    this.logger.log(`${SEED_PRODUCTS.length} productos cargados`);
  }
}

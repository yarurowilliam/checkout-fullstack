import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../domain/product';
import { ProductRepository } from '../../domain/ports/product.repository';
import { ProductEntity } from './entities';

@Injectable()
export class TypeOrmProductRepository implements ProductRepository {
  constructor(@InjectRepository(ProductEntity) private readonly repo: Repository<ProductEntity>) {}

  findAll(): Promise<Product[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  findById(id: string): Promise<Product | null> {
    return this.repo.findOneBy({ id });
  }
}

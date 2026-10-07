import { Inject, Injectable } from '@nestjs/common';
import { Product } from '../domain/product';
import { PRODUCT_REPOSITORY, ProductRepository } from '../domain/ports/product.repository';
import { fromNullable, ok, Result } from '../shared/result';

@Injectable()
export class ProductsUseCases {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository) {}

  async list(): Promise<Result<Product[]>> {
    return ok(await this.products.findAll());
  }

  async get(id: string): Promise<Result<Product>> {
    return fromNullable(await this.products.findById(id), 'NOT_FOUND', `Producto ${id} no encontrado`);
  }
}

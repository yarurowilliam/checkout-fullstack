import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductsUseCases } from '../../application/products.use-cases';
import { Product } from '../../domain/product';
import { unwrap } from './http-result';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly useCases: ProductsUseCases) {}

  @Get()
  async list(): Promise<Product[]> {
    return unwrap(await this.useCases.list());
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return unwrap(await this.useCases.get(id));
  }
}

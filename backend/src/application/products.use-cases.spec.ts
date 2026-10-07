import { Product } from '../domain/product';
import { ProductRepository } from '../domain/ports/product.repository';
import { ProductsUseCases } from './products.use-cases';

const product: Product = {
  id: 'p1',
  name: 'Reloj',
  description: 'desc',
  priceInCents: 100,
  stock: 2,
  imageUrl: 'http://img',
};

describe('ProductsUseCases', () => {
  const repo: jest.Mocked<ProductRepository> = { findAll: jest.fn(), findById: jest.fn() };
  const useCases = new ProductsUseCases(repo);

  it('lista los productos', async () => {
    repo.findAll.mockResolvedValue([product]);
    expect(await useCases.list()).toEqual({ ok: true, value: [product] });
  });

  it('obtiene un producto existente', async () => {
    repo.findById.mockResolvedValue(product);
    expect(await useCases.get('p1')).toEqual({ ok: true, value: product });
  });

  it('devuelve NOT_FOUND si el producto no existe', async () => {
    repo.findById.mockResolvedValue(null);
    const result = await useCases.get('nope');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('NOT_FOUND');
  });
});

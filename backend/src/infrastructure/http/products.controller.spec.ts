import { HttpException } from '@nestjs/common';
import { ProductsUseCases } from '../../application/products.use-cases';
import { err, ok } from '../../shared/result';
import { unwrap } from './http-result';
import { ProductsController } from './products.controller';

describe('ProductsController', () => {
  const useCases = { list: jest.fn(), get: jest.fn() } as unknown as jest.Mocked<ProductsUseCases>;
  const controller = new ProductsController(useCases);

  it('GET /products devuelve la lista', async () => {
    useCases.list.mockResolvedValue(ok([]));
    expect(await controller.list()).toEqual([]);
  });

  it('GET /products/:id responde 404 si no existe', async () => {
    useCases.get.mockResolvedValue(err('NOT_FOUND', 'no'));
    await expect(controller.get('x')).rejects.toMatchObject({ status: 404 });
  });
});

describe('unwrap', () => {
  it.each([
    ['VALIDATION', 400],
    ['OUT_OF_STOCK', 409],
    ['CONFLICT', 409],
    ['GATEWAY', 502],
  ] as const)('mapea %s a HTTP %i', (code, status) => {
    expect.assertions(2);
    try {
      unwrap(err(code, 'm'));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(status);
      expect((e as HttpException).getResponse()).toEqual({ code, message: 'm' });
    }
  });
});

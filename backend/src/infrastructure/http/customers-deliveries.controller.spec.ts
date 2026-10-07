import { CustomersUseCases } from '../../application/customers.use-cases';
import { DeliveriesUseCases } from '../../application/deliveries.use-cases';
import { err, ok } from '../../shared/result';
import { CustomersController, DeliveriesController } from './customers-deliveries.controller';

describe('CustomersController', () => {
  const useCases = { get: jest.fn() } as unknown as jest.Mocked<CustomersUseCases>;
  const controller = new CustomersController(useCases);

  it('GET /customers/:id no expone el teléfono', async () => {
    useCases.get.mockResolvedValue(ok({ id: 'c1', email: 'a@b.co', fullName: 'Ana', phone: '3001234567' }));
    expect(await controller.get('c1')).toEqual({ id: 'c1', email: 'a@b.co', fullName: 'Ana' });
  });

  it('GET /customers/:id responde 404 si no existe', async () => {
    useCases.get.mockResolvedValue(err('NOT_FOUND', 'no'));
    await expect(controller.get('x')).rejects.toMatchObject({ status: 404 });
  });
});

describe('DeliveriesController', () => {
  const useCases = { get: jest.fn() } as unknown as jest.Mocked<DeliveriesUseCases>;
  const controller = new DeliveriesController(useCases);

  it('GET /deliveries/:id devuelve la entrega', async () => {
    useCases.get.mockResolvedValue(ok({ id: 'd1', status: 'ASSIGNED' } as never));
    expect(await controller.get('d1')).toEqual({ id: 'd1', status: 'ASSIGNED' });
  });

  it('GET /deliveries/:id responde 404 si no existe', async () => {
    useCases.get.mockResolvedValue(err('NOT_FOUND', 'no'));
    await expect(controller.get('x')).rejects.toMatchObject({ status: 404 });
  });
});

import { CustomerRepository } from '../domain/ports/customer.repository';
import { DeliveryDetail, DeliveryRepository } from '../domain/ports/delivery.repository';
import { CustomersUseCases } from './customers.use-cases';
import { DeliveriesUseCases } from './deliveries.use-cases';

const customer = { id: 'c1', email: 'ana@test.co', fullName: 'Ana', phone: '3001234567' };
const delivery: DeliveryDetail = {
  id: 'd1',
  transactionId: 't1',
  address: 'Calle 1',
  city: 'Bogotá',
  region: 'Cund',
  postalCode: null,
  status: 'ASSIGNED',
  createdAt: new Date(),
};

describe('CustomersUseCases', () => {
  const repo: jest.Mocked<CustomerRepository> = { findById: jest.fn() };
  const useCases = new CustomersUseCases(repo);

  it('obtiene un cliente existente', async () => {
    repo.findById.mockResolvedValue(customer);
    expect(await useCases.get('c1')).toEqual({ ok: true, value: customer });
  });

  it('devuelve NOT_FOUND si no existe', async () => {
    repo.findById.mockResolvedValue(null);
    expect(await useCases.get('x')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'Cliente x no encontrado' } });
  });
});

describe('DeliveriesUseCases', () => {
  const repo: jest.Mocked<DeliveryRepository> = { findById: jest.fn() };
  const useCases = new DeliveriesUseCases(repo);

  it('obtiene una entrega existente', async () => {
    repo.findById.mockResolvedValue(delivery);
    expect(await useCases.get('d1')).toEqual({ ok: true, value: delivery });
  });

  it('devuelve NOT_FOUND si no existe', async () => {
    repo.findById.mockResolvedValue(null);
    expect(await useCases.get('x')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'Entrega x no encontrada' } });
  });
});

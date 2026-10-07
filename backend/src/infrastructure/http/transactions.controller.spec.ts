import { TransactionsUseCases } from '../../application/transactions.use-cases';
import { err, ok } from '../../shared/result';
import { TransactionsController } from './transactions.controller';
import { CreateTransactionDto, PayTransactionDto } from './transactions.dto';

const tx = {
  id: 't1',
  status: 'PENDING',
  customer: { id: 'c1', email: 'a@b.co', fullName: 'Ana', phone: '3001234567' },
};

describe('TransactionsController', () => {
  const useCases = {
    fees: jest.fn().mockReturnValue({ baseFeeInCents: 1, deliveryFeeInCents: 2 }),
    create: jest.fn(),
    get: jest.fn(),
    pay: jest.fn(),
  } as unknown as jest.Mocked<TransactionsUseCases>;
  const controller = new TransactionsController(useCases);

  it('GET /checkout/fees devuelve las tarifas', () => {
    expect(controller.fees()).toEqual({ baseFeeInCents: 1, deliveryFeeInCents: 2 });
  });

  it('POST /transactions no expone el teléfono ni el id del cliente', async () => {
    useCases.create.mockResolvedValue(ok(tx as never));
    expect(await controller.create({} as CreateTransactionDto)).toEqual({
      id: 't1',
      status: 'PENDING',
      customer: { fullName: 'Ana', email: 'a@b.co' },
    });
  });

  it('GET /transactions/:id responde 404 si no existe', async () => {
    useCases.get.mockResolvedValue(err('NOT_FOUND', 'no'));
    await expect(controller.get('t1')).rejects.toMatchObject({ status: 404 });
  });

  it('POST /transactions/:id/payment responde 409 si ya fue procesada', async () => {
    useCases.pay.mockResolvedValue(err('CONFLICT', 'ya'));
    await expect(controller.pay('t1', {} as PayTransactionDto)).rejects.toMatchObject({ status: 409 });
  });
});

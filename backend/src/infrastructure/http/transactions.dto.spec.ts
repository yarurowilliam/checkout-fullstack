import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto, PayTransactionDto } from './transactions.dto';

const errorsOf = async <T extends object>(cls: new () => T, plain: object) => {
  const errors = await validate(plainToInstance(cls, plain));
  const flatten = (list: typeof errors, prefix = ''): string[] =>
    list.flatMap((e) => [
      ...(e.constraints ? [`${prefix}${e.property}`] : []),
      ...flatten(e.children ?? [], `${prefix}${e.property}.`),
    ]);
  return flatten(errors);
};

const validTransaction = {
  productId: '6f1c5d1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f',
  quantity: 1,
  customer: { email: 'ana@test.co', fullName: 'Ana Pérez', phone: '+573001234567' },
  delivery: { address: 'Calle 10 # 20-30', city: 'Bogotá', region: 'Cundinamarca', postalCode: '110111' },
};

describe('CreateTransactionDto', () => {
  it('acepta un cuerpo válido', async () => {
    expect(await errorsOf(CreateTransactionDto, validTransaction)).toEqual([]);
  });

  it('rechaza datos inválidos, incluidos los anidados', async () => {
    const errors = await errorsOf(CreateTransactionDto, {
      productId: 'abc',
      quantity: 11,
      customer: { email: 'no-email', fullName: 'A', phone: '12' },
      delivery: { address: 'x', city: 'B', region: 'C', postalCode: '12' },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'productId',
        'quantity',
        'customer.email',
        'customer.fullName',
        'customer.phone',
        'delivery.address',
        'delivery.postalCode',
      ]),
    );
  });
});

describe('PayTransactionDto', () => {
  const valid = { cardToken: 'tok_stagtest_123_ABC', installments: 1, acceptanceToken: 'a'.repeat(30), acceptPersonalAuth: 'b'.repeat(30) };

  it('acepta un cuerpo válido', async () => {
    expect(await errorsOf(PayTransactionDto, valid)).toEqual([]);
  });

  it('rechaza tokens con formato inválido y cuotas fuera de rango', async () => {
    const errors = await errorsOf(PayTransactionDto, { ...valid, cardToken: '4242424242424242', installments: 0 });
    expect(errors).toEqual(['cardToken', 'installments']);
  });
});

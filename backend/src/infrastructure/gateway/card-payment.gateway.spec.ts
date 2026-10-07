import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CardPaymentGateway } from './card-payment.gateway';

const config = new ConfigService({
  GATEWAY_URL: 'https://gw.test/v1',
  GATEWAY_PUBLIC_KEY: 'pub_k',
  GATEWAY_PRIVATE_KEY: 'prv_k',
  GATEWAY_INTEGRITY_SECRET: 'secret',
  GATEWAY_RETRIES: 3,
  GATEWAY_RETRY_DELAY_MS: 0,
});

const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

const gatewayTx = {
  id: 'g1',
  status: 'APPROVED',
  payment_method: { type: 'CARD', extra: { brand: 'VISA', last_four: '4242' } },
};

describe('CardPaymentGateway', () => {
  const fetchMock = jest.fn();
  const gateway = new CardPaymentGateway(config);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('calcula la firma de integridad', () => {
    const expected = createHash('sha256').update('REF1500000COPsecret').digest('hex');
    expect(gateway.signature('REF', 1500000)).toBe(expected);
  });

  it('crea el pago con la llave privada, firma y token de la tarjeta', async () => {
    fetchMock.mockResolvedValue(response(201, { data: gatewayTx }));
    const result = await gateway.createPayment({
      reference: 'REF',
      amountInCents: 1500000,
      customerEmail: 'a@b.co',
      cardToken: 'tok_1',
      installments: 2,
      acceptanceToken: 'acc',
      acceptPersonalAuth: 'per',
    });

    expect(result).toEqual({ ok: true, value: { id: 'g1', status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gw.test/v1/transactions');
    expect(init.headers.Authorization).toBe('Bearer prv_k');
    expect(JSON.parse(init.body)).toMatchObject({
      amount_in_cents: 1500000,
      currency: 'COP',
      signature: gateway.signature('REF', 1500000),
      accept_personal_auth: 'per',
      payment_method: { type: 'CARD', token: 'tok_1', installments: 2 },
    });
  });

  it('consulta el pago con la llave pública y tolera datos de tarjeta ausentes', async () => {
    fetchMock.mockResolvedValue(response(200, { data: { id: 'g/1', status: 'PENDING' } }));
    const result = await gateway.getPayment('g/1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://gw.test/v1/transactions/g%2F1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer pub_k');
    expect(result).toEqual({ ok: true, value: { id: 'g/1', status: 'PENDING', cardBrand: null, cardLastFour: null } });
  });

  it('reintenta ante errores 5xx y de red', async () => {
    fetchMock
      .mockResolvedValueOnce(response(500, {}))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(response(200, { data: gatewayTx }));
    expect((await gateway.getPayment('g1')).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('no reintenta errores 4xx y devuelve GATEWAY con el detalle', async () => {
    fetchMock.mockResolvedValue(response(422, { error: { type: 'INPUT_VALIDATION_ERROR' } }));
    const result = await gateway.getPayment('g1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: { code: 'GATEWAY', message: '{"type":"INPUT_VALIDATION_ERROR"}' } });
  });

  it('devuelve GATEWAY tras agotar los reintentos, aunque el cuerpo no sea JSON', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => Promise.reject(new Error('html')) });
    const result = await gateway.getPayment('g1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: false, error: { code: 'GATEWAY', message: '{}' } });
  });
});

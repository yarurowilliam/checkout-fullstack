import { backend } from './backend';
import { gateway } from './gateway';
import { HttpError, requestJson } from './http';

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

describe('requestJson', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('devuelve el JSON y envía Content-Type', async () => {
    fetchMock.mockResolvedValue(res(200, { a: 1 }));
    expect(await requestJson('/x', { headers: { X: '1' } })).toEqual({ a: 1 });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json', X: '1' });
  });

  it('reintenta errores 5xx y de red', async () => {
    fetchMock
      .mockResolvedValueOnce(res(503, null))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(res(200, 'ok'));
    expect(await requestJson('/x', {}, { retries: 3, delayMs: 0 })).toBe('ok');
  });

  it('no reintenta 4xx y expone el mensaje del backend', async () => {
    fetchMock.mockResolvedValue(res(409, { message: 'La transacción ya fue procesada' }));
    await expect(requestJson('/x', {}, { retries: 3, delayMs: 0 })).rejects.toEqual(new HttpError(409, 'La transacción ya fue procesada'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('une mensajes de validación y usa reason de la pasarela', async () => {
    fetchMock.mockResolvedValueOnce(res(400, { message: ['a', 'b'] }));
    await expect(requestJson('/x')).rejects.toThrow('a, b');
    fetchMock.mockResolvedValueOnce(res(404, { error: { reason: 'No existe' } }));
    await expect(requestJson('/x')).rejects.toThrow('No existe');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.reject(new Error('html')) });
    await expect(requestJson('/x')).rejects.toThrow('Error 500');
  });

  it('informa falta de conexión tras agotar reintentos', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(requestJson('/x', {}, { retries: 2, delayMs: 0 })).rejects.toThrow('No se pudo conectar');
  });
});

describe('backend', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(res(200, {}));
    global.fetch = fetchMock;
  });

  it('llama a cada endpoint con el método y cuerpo correctos', async () => {
    await backend.products();
    await backend.fees();
    await backend.transaction('t1');
    await backend.pay('t1', { cardToken: 'tok', installments: 1, acceptanceToken: 'a', acceptPersonalAuth: 'b' });
    await backend.createTransaction({
      productId: 'p1',
      quantity: 1,
      customer: { fullName: 'Ana', email: 'a@b.co', phone: '300' },
      delivery: { address: 'Calle', city: 'Bogotá', region: 'Cund', postalCode: '' },
    });
    const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method ?? 'GET'} ${url}`);
    expect(calls).toEqual([
      'GET http://api.test/api/products',
      'GET http://api.test/api/checkout/fees',
      'GET http://api.test/api/transactions/t1',
      'POST http://api.test/api/transactions/t1/payment',
      'POST http://api.test/api/transactions',
    ]);
    // El código postal vacío no se envía.
    expect(JSON.parse(fetchMock.mock.calls[4][1].body).delivery.postalCode).toBeUndefined();
  });
});

describe('gateway', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('tokeniza la tarjeta con la llave pública', async () => {
    fetchMock.mockResolvedValue(res(201, { data: { id: 'tok_1', brand: 'VISA', last_four: '4242' } }));
    const token = await gateway.tokenizeCard({ number: '4242', cvc: '123', expMonth: '08', expYear: '29', holder: 'Ana' });
    expect(token).toEqual({ id: 'tok_1', brand: 'VISA', lastFour: '4242' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://gateway.test/v1/tokens/cards');
    expect(init.headers.Authorization).toBe('Bearer pub_test_key');
    expect(JSON.parse(init.body)).toEqual({ number: '4242', cvc: '123', exp_month: '08', exp_year: '29', card_holder: 'Ana' });
  });

  it('obtiene los tokens de aceptación', async () => {
    fetchMock.mockResolvedValue(
      res(200, {
        data: {
          presigned_acceptance: { acceptance_token: 'acc', permalink: 'https://t' },
          presigned_personal_data_auth: { acceptance_token: 'per', permalink: 'https://d' },
        },
      }),
    );
    expect(await gateway.acceptance()).toEqual({ acceptanceToken: 'acc', acceptPersonalAuth: 'per', termsUrl: 'https://t', personalDataUrl: 'https://d' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://gateway.test/v1/merchants/pub_test_key');
  });
});

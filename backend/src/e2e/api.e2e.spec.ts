import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { CheckoutModule } from '../checkout.module';
import { GatewayPayment, PAYMENT_GATEWAY, PaymentGateway, PaymentRequest } from '../domain/ports/payment-gateway';
import { ENTITIES } from '../infrastructure/persistence/entities';
import { configureApp } from '../setup';
import { err, ok } from '../shared/result';
import { createMemoryDataSource } from '../test-utils/pg-mem';

// Pasarela simulada: el resultado depende del token de la tarjeta.
const OUTCOMES: Record<string, GatewayPayment['status']> = { tok_ok: 'APPROVED', tok_declined: 'DECLINED' };
const fakeGateway: PaymentGateway & { requests: PaymentRequest[] } = {
  requests: [],
  async createPayment(req) {
    this.requests.push(req);
    if (req.cardToken === 'tok_gateway_down') return err('GATEWAY', 'Servicio no disponible');
    const status = OUTCOMES[req.cardToken] ?? 'ERROR';
    return ok({ id: `gw-${req.reference}`, status, cardBrand: 'VISA', cardLastFour: status === 'DECLINED' ? '1111' : '4242' });
  },
  async getPayment(id) {
    return ok({ id, status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242' });
  },
};

const createApp = async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            GATEWAY_URL: 'http://gateway.test',
            GATEWAY_PUBLIC_KEY: 'pub',
            GATEWAY_PRIVATE_KEY: 'prv',
            GATEWAY_INTEGRITY_SECRET: 'secret',
            PAYMENT_POLL_ATTEMPTS: 0,
          }),
        ],
      }),
      TypeOrmModule.forRootAsync({
        useFactory: () => ({ type: 'postgres', entities: ENTITIES }),
        dataSourceFactory: () => createMemoryDataSource(),
      }),
      CheckoutModule,
    ],
  })
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue(fakeGateway)
    .compile();

  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  return app;
};

const newTransaction = (productId: string, quantity = 1) => ({
  productId,
  quantity,
  customer: { email: 'ana@test.com', fullName: 'Ana Pérez', phone: '3001234567' },
  delivery: { address: 'Calle 10 # 20-30', city: 'Bogotá', region: 'Cundinamarca', postalCode: '110111' },
});

const payment = (cardToken: string) => ({
  cardToken,
  installments: 1,
  acceptanceToken: 'a'.repeat(30),
  acceptPersonalAuth: 'b'.repeat(30),
});

describe('API (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  let products: { id: string; name: string; stock: number; priceInCents: number }[];

  const stockOf = async (id: string) => (await request(http).get(`/api/products/${id}`)).body.stock as number;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    products = (await request(http).get('/api/products')).body;
  });

  afterAll(() => app.close());

  describe('productos y tarifas', () => {
    it('GET /api/products lista los productos del seed con stock', () => {
      expect(products).toHaveLength(3);
      expect(products.every((p) => p.stock > 0 && p.priceInCents > 0)).toBe(true);
    });

    it('GET /api/products/:id devuelve el detalle, 404 si no existe y 400 si el id no es UUID', async () => {
      await request(http).get(`/api/products/${products[0].id}`).expect(200).expect((r) => expect(r.body.name).toBe(products[0].name));
      await request(http).get('/api/products/00000000-0000-0000-0000-000000000000').expect(404);
      await request(http).get('/api/products/abc').expect(400);
    });

    it('GET /api/checkout/fees devuelve la tarifa base y la de envío', async () => {
      await request(http).get('/api/checkout/fees').expect(200, { baseFeeInCents: 200000, deliveryFeeInCents: 800000 });
    });
  });

  describe('compra aprobada', () => {
    it('crea la transacción, cobra, descuenta stock, asigna la entrega y expone cliente y entrega', async () => {
      const product = products[0];
      const before = await stockOf(product.id);

      const created = await request(http).post('/api/transactions').send(newTransaction(product.id, 2)).expect(201);
      expect(created.body).toMatchObject({
        status: 'PENDING',
        quantity: 2,
        amountInCents: product.priceInCents * 2,
        totalInCents: product.priceInCents * 2 + 1000000,
        delivery: { status: 'PENDING' },
      });
      expect(created.body.customer).not.toHaveProperty('phone');
      expect(created.body.reference).toMatch(/^TX-/);

      const paid = await request(http).post(`/api/transactions/${created.body.id}/payment`).send(payment('tok_ok')).expect(200);
      expect(paid.body).toMatchObject({ status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242', delivery: { status: 'ASSIGNED' } });
      expect(fakeGateway.requests.at(-1)).toMatchObject({ amountInCents: created.body.totalInCents, reference: created.body.reference });
      expect(await stockOf(product.id)).toBe(before - 2);

      await request(http).get(`/api/transactions/${created.body.id}`).expect(200).expect((r) => expect(r.body.status).toBe('APPROVED'));

      const customer = await request(http).get(`/api/customers/${created.body.customer.id}`).expect(200);
      expect(customer.body).toEqual({ id: created.body.customer.id, email: 'ana@test.com', fullName: 'Ana Pérez' });

      const delivery = await request(http).get(`/api/deliveries/${created.body.delivery.id}`).expect(200);
      expect(delivery.body).toMatchObject({ transactionId: created.body.id, status: 'ASSIGNED', city: 'Bogotá', postalCode: '110111' });
    });

    it('no permite pagar dos veces la misma transacción (409)', async () => {
      const created = await request(http).post('/api/transactions').send(newTransaction(products[1].id)).expect(201);
      await request(http).post(`/api/transactions/${created.body.id}/payment`).send(payment('tok_ok')).expect(200);
      const again = await request(http).post(`/api/transactions/${created.body.id}/payment`).send(payment('tok_ok')).expect(409);
      expect(again.body).toEqual({ code: 'CONFLICT', message: 'La transacción ya fue procesada' });
    });
  });

  describe('pagos no aprobados', () => {
    it('rechazado: no descuenta stock y cancela la entrega', async () => {
      const product = products[2];
      const before = await stockOf(product.id);
      const created = await request(http).post('/api/transactions').send(newTransaction(product.id)).expect(201);
      const paid = await request(http).post(`/api/transactions/${created.body.id}/payment`).send(payment('tok_declined')).expect(200);
      expect(paid.body).toMatchObject({ status: 'DECLINED', cardLastFour: '1111', delivery: { status: 'CANCELLED' } });
      expect(await stockOf(product.id)).toBe(before);
    });

    it('pasarela caída: la transacción queda en ERROR sin tocar el stock', async () => {
      const product = products[2];
      const before = await stockOf(product.id);
      const created = await request(http).post('/api/transactions').send(newTransaction(product.id)).expect(201);
      const paid = await request(http).post(`/api/transactions/${created.body.id}/payment`).send(payment('tok_gateway_down')).expect(200);
      expect(paid.body).toMatchObject({ status: 'ERROR', delivery: { status: 'CANCELLED' } });
      expect(await stockOf(product.id)).toBe(before);
    });
  });

  describe('validaciones', () => {
    it('rechaza cuerpos inválidos con el detalle de cada campo (400)', async () => {
      const res = await request(http)
        .post('/api/transactions')
        .send({ productId: 'abc', quantity: 0, customer: { email: 'mal', fullName: 'A', phone: '1' }, delivery: { address: 'x' } })
        .expect(400);
      const messages: string[] = res.body.message;
      for (const field of ['productId', 'quantity', 'customer.email', 'customer.phone', 'delivery.address', 'delivery.city']) {
        expect(messages.some((m) => m.startsWith(field))).toBe(true);
      }
    });

    it('rechaza campos no declarados (400)', async () => {
      await request(http).post('/api/transactions').send({ ...newTransaction(products[0].id), isAdmin: true }).expect(400);
    });

    it('rechaza una cantidad mayor al stock (409) y un producto inexistente (404)', async () => {
      const watch = products.find((p) => p.name.startsWith('Reloj'))!;
      const stock = await stockOf(watch.id);
      const res = await request(http).post('/api/transactions').send(newTransaction(watch.id, stock + 1)).expect(409);
      expect(res.body.code).toBe('OUT_OF_STOCK');
      await request(http).post('/api/transactions').send(newTransaction('00000000-0000-0000-0000-000000000000')).expect(404);
    });

    it('rechaza tokens de tarjeta con formato inválido (400)', async () => {
      const created = await request(http).post('/api/transactions').send(newTransaction(products[0].id)).expect(201);
      await request(http).post(`/api/transactions/${created.body.id}/payment`).send(payment('4242424242424242')).expect(400);
    });

    it('responde 404 para transacciones, clientes y entregas inexistentes', async () => {
      const missing = '00000000-0000-0000-0000-000000000000';
      for (const path of ['transactions', 'customers', 'deliveries']) {
        await request(http).get(`/api/${path}/${missing}`).expect(404);
      }
    });
  });

  describe('seguridad', () => {
    it('incluye cabeceras de seguridad (helmet)', async () => {
      const res = await request(http).get('/api/products').expect(200);
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('rechaza cuerpos JSON mayores a 10 KB (413)', async () => {
      await request(http)
        .post('/api/transactions')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ padding: 'x'.repeat(11_000) }))
        .expect(413);
    });

    it('publica la documentación Swagger', async () => {
      await request(http).get('/api/docs').expect(200);
    });
  });
});

describe('API (e2e): rate limit', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(() => app.close());

  it('limita los intentos de pago a 10 por minuto por IP (429)', async () => {
    const http = app.getHttpServer();
    const url = '/api/transactions/00000000-0000-0000-0000-000000000000/payment';
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await request(http).post(url).send(payment('tok_ok'))).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

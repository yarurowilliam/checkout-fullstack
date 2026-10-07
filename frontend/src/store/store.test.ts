import { fakeExtra, transaction } from '../test/utils';
import { createStore } from '.';
import {
  finishCheckout,
  goTo,
  initialCheckout,
  loadFees,
  payTransaction,
  refreshTransaction,
  retryPayment,
  startCheckout,
  submitPaymentForm,
  type PaymentForm,
} from './checkoutSlice';
import { loadCheckout, saveCheckout } from './persistence';
import { fetchProducts } from './productsSlice';
import type { ThunkExtra } from './thunk';

const form: PaymentForm = {
  card: { number: '4242424242424242', cvc: '123', expMonth: '08', expYear: '29', holder: 'Ana Perez' },
  installments: 2,
  customer: { fullName: 'Ana Pérez', email: 'ana@test.com', phone: '3001234567' },
  delivery: { address: 'Calle 10', city: 'Bogotá', region: 'Cund', postalCode: '' },
};

const setup = () => {
  const extra = fakeExtra();
  const store = createStore(extra as unknown as ThunkExtra);
  return { extra, store, state: () => store.getState().checkout };
};

const readyToPay = async () => {
  const ctx = setup();
  ctx.store.dispatch(startCheckout({ productId: 'p1', quantity: 2 }));
  await ctx.store.dispatch(submitPaymentForm(form));
  return ctx;
};

beforeEach(() => localStorage.clear());

describe('productos', () => {
  it('carga productos y maneja errores', async () => {
    const { store, extra } = setup();
    await store.dispatch(fetchProducts());
    expect(store.getState().products).toMatchObject({ status: 'ready', items: [{ id: 'p1' }] });

    extra.backend.products.mockRejectedValueOnce(new Error('caído'));
    await store.dispatch(fetchProducts());
    expect(store.getState().products).toMatchObject({ status: 'error', error: 'caído' });
  });
});

describe('checkout', () => {
  it('inicia el checkout con producto y cantidad', () => {
    const { store, state } = setup();
    store.dispatch(startCheckout({ productId: 'p1', quantity: 2 }));
    expect(state()).toMatchObject({ step: 'payment', productId: 'p1', quantity: 2 });
    store.dispatch(goTo('product'));
    expect(state().step).toBe('product');
  });

  it('carga las tarifas', async () => {
    const { store, state } = setup();
    await store.dispatch(loadFees());
    expect(state().fees).toEqual({ baseFeeInCents: 200000, deliveryFeeInCents: 800000 });
  });

  it('tokeniza la tarjeta y guarda solo marca y últimos 4 dígitos', async () => {
    const { state, extra } = await readyToPay();
    expect(extra.gateway.tokenizeCard).toHaveBeenCalledWith(form.card);
    expect(state()).toMatchObject({
      step: 'summary',
      cardToken: 'tok_1',
      card: { brand: 'VISA', lastFour: '4242', holder: 'Ana Perez', installments: 2 },
      customer: form.customer,
    });
    expect(JSON.stringify(state())).not.toContain('4242424242424242');
  });

  it('muestra un error si la tokenización falla', async () => {
    const { store, state, extra } = setup();
    extra.gateway.tokenizeCard.mockRejectedValueOnce(new Error('tarjeta inválida'));
    await store.dispatch(submitPaymentForm(form));
    expect(state()).toMatchObject({ step: 'product', busy: false, error: 'No pudimos validar la tarjeta: tarjeta inválida' });
  });

  it('crea la transacción, pide aceptación nueva y paga', async () => {
    const { store, state, extra } = await readyToPay();
    await store.dispatch(payTransaction());
    expect(extra.backend.createTransaction).toHaveBeenCalledWith({
      productId: 'p1',
      quantity: 2,
      customer: form.customer,
      delivery: form.delivery,
    });
    expect(extra.backend.pay).toHaveBeenCalledWith('t1', {
      cardToken: 'tok_1',
      installments: 2,
      acceptanceToken: 'acc',
      acceptPersonalAuth: 'per',
    });
    expect(state()).toMatchObject({ step: 'result', busy: false, cardToken: null, transaction: { status: 'APPROVED' } });
  });

  it('reutiliza una transacción PENDING que no llegó a la pasarela', async () => {
    const { store, extra } = await readyToPay();
    extra.backend.pay.mockRejectedValueOnce(new Error('Sin conexión'));
    await store.dispatch(payTransaction());
    expect(store.getState().checkout).toMatchObject({ step: 'result', error: 'Sin conexión', transaction: { status: 'PENDING' } });

    store.dispatch(retryPayment());
    expect(store.getState().checkout).toMatchObject({ step: 'payment', cardToken: null, card: null });
    await store.dispatch(submitPaymentForm(form));
    await store.dispatch(payTransaction());
    expect(extra.backend.createTransaction).toHaveBeenCalledTimes(1);
    expect(extra.backend.pay).toHaveBeenCalledTimes(2);
  });

  it('no paga sin token de tarjeta', async () => {
    const { store, state, extra } = setup();
    await store.dispatch(payTransaction());
    expect(extra.backend.createTransaction).not.toHaveBeenCalled();
    expect(state().error).toBe('Faltan los datos de la tarjeta');
  });

  it('refresca la transacción y reinicia conservando los datos del cliente', async () => {
    const { store, state, extra } = await readyToPay();
    extra.backend.transaction.mockResolvedValueOnce(transaction({ status: 'DECLINED' }));
    await store.dispatch(refreshTransaction('t1'));
    expect(state().transaction?.status).toBe('DECLINED');

    await store.dispatch(loadFees());
    store.dispatch(finishCheckout());
    expect(state()).toEqual({ ...initialCheckout, customer: form.customer, delivery: form.delivery, fees: state().fees });
  });
});

describe('persistencia', () => {
  it('guarda el progreso sin token, busy ni error', async () => {
    const { store } = await readyToPay();
    const saved = JSON.parse(localStorage.getItem('checkout:v1')!);
    expect(saved.step).toBe('summary');
    expect(saved).not.toHaveProperty('cardToken');
    expect(store.getState().checkout.cardToken).toBe('tok_1');
  });

  it('al recargar en el resumen vuelve al formulario (el token no se persiste)', async () => {
    await readyToPay();
    expect(loadCheckout()).toMatchObject({ step: 'payment', cardToken: null, card: { lastFour: '4242' } });
  });

  it('restaura el resultado de una transacción', () => {
    localStorage.setItem('checkout:v1', JSON.stringify({ step: 'result', transaction: transaction() }));
    expect(loadCheckout()).toMatchObject({ step: 'result', transaction: { id: 't1' } });
  });

  it('tolera almacenamiento vacío, corrupto o no disponible', () => {
    expect(loadCheckout()).toEqual(initialCheckout);
    localStorage.setItem('checkout:v1', '{roto');
    expect(loadCheckout()).toEqual(initialCheckout);
    const broken = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(() => saveCheckout(initialCheckout, broken)).not.toThrow();
  });
});

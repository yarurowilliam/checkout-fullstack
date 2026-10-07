import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CardInput } from '../api/gateway';
import type { CardSummary, CustomerData, DeliveryData, Fees, Transaction } from '../domain/types';
import { createAppThunk } from './thunk';

export type Step = 'product' | 'payment' | 'summary' | 'result';

export interface CheckoutState {
  step: Step;
  productId: string | null;
  quantity: number;
  customer: CustomerData;
  delivery: DeliveryData;
  card: CardSummary | null;
  /** Token de un solo uso: vive solo en memoria, nunca se persiste. */
  cardToken: string | null;
  fees: Fees | null;
  transaction: Transaction | null;
  busy: boolean;
  error: string | null;
}

export const initialCheckout: CheckoutState = {
  step: 'product',
  productId: null,
  quantity: 1,
  customer: { fullName: '', email: '', phone: '' },
  delivery: { address: '', city: '', region: '', postalCode: '' },
  card: null,
  cardToken: null,
  fees: null,
  transaction: null,
  busy: false,
  error: null,
};

export interface PaymentForm {
  card: CardInput;
  installments: number;
  customer: CustomerData;
  delivery: DeliveryData;
}

export const loadFees = createAppThunk('checkout/fees', (_: void, { extra }) => extra.backend.fees());

/** Tokeniza la tarjeta en la pasarela y guarda solo marca y últimos 4 dígitos. */
export const submitPaymentForm = createAppThunk('checkout/submitForm', async (form: PaymentForm, { extra }) => {
  const token = await extra.gateway.tokenizeCard(form.card);
  return { ...form, token };
});

/**
 * Paso 5 del flujo: crea la transacción PENDING (o reutiliza la que quedó sin enviar),
 * pide tokens de aceptación nuevos y cobra.
 */
export const payTransaction = createAppThunk('checkout/pay', async (_: void, { extra, getState, dispatch }) => {
  const s = getState().checkout;
  if (!s.cardToken || !s.card || !s.productId) throw new Error('Faltan los datos de la tarjeta');

  const reusable = s.transaction?.status === 'PENDING' && !s.transaction.gatewayTransactionId;
  const tx = reusable
    ? s.transaction!
    : await extra.backend.createTransaction({
        productId: s.productId,
        quantity: s.quantity,
        customer: s.customer,
        delivery: s.delivery,
      });
  dispatch(transactionStarted(tx));

  const acceptance = await extra.gateway.acceptance();
  return extra.backend.pay(tx.id, {
    cardToken: s.cardToken,
    installments: s.card.installments,
    acceptanceToken: acceptance.acceptanceToken,
    acceptPersonalAuth: acceptance.acceptPersonalAuth,
  });
});

export const refreshTransaction = createAppThunk('checkout/refresh', (id: string, { extra }) => extra.backend.transaction(id));

const checkoutSlice = createSlice({
  name: 'checkout',
  initialState: initialCheckout,
  reducers: {
    startCheckout(state, action: PayloadAction<{ productId: string; quantity: number }>) {
      Object.assign(state, action.payload, { step: 'payment', transaction: null, error: null });
    },
    goTo(state, action: PayloadAction<Step>) {
      state.step = action.payload;
      state.error = null;
    },
    transactionStarted(state, action: PayloadAction<Transaction>) {
      state.transaction = action.payload;
      state.step = 'result';
    },
    retryPayment(state) {
      state.step = 'payment';
      state.cardToken = null;
      state.card = null;
      state.error = null;
    },
    finishCheckout(state) {
      // Conserva los datos del cliente y la entrega para la siguiente compra.
      return { ...initialCheckout, customer: state.customer, delivery: state.delivery, fees: state.fees };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadFees.fulfilled, (state, action) => {
        state.fees = action.payload;
      })
      .addCase(submitPaymentForm.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(submitPaymentForm.fulfilled, (state, { payload }) => {
        state.busy = false;
        state.customer = payload.customer;
        state.delivery = payload.delivery;
        state.cardToken = payload.token.id;
        state.card = {
          brand: payload.token.brand,
          lastFour: payload.token.lastFour,
          holder: payload.card.holder,
          installments: payload.installments,
        };
        state.step = 'summary';
      })
      .addCase(submitPaymentForm.rejected, (state, action) => {
        state.busy = false;
        state.error = `No pudimos validar la tarjeta: ${action.error.message}`;
      })
      .addCase(payTransaction.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(payTransaction.fulfilled, (state, action) => {
        state.busy = false;
        state.transaction = action.payload;
        state.cardToken = null;
        state.step = 'result';
      })
      .addCase(payTransaction.rejected, (state, action) => {
        state.busy = false;
        state.cardToken = null;
        state.error = action.error.message ?? 'No se pudo procesar el pago';
      })
      .addCase(refreshTransaction.fulfilled, (state, action) => {
        state.transaction = action.payload;
      });
  },
});

export const { startCheckout, goTo, transactionStarted, retryPayment, finishCheckout } = checkoutSlice.actions;
export default checkoutSlice.reducer;

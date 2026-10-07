import { initialCheckout, type CheckoutState } from './checkoutSlice';

const KEY = 'checkout:v1';

/**
 * Restaura el progreso tras un refresh. Sin token de tarjeta (no se persiste)
 * no se puede volver al resumen, así que se regresa al formulario de pago.
 */
export const loadCheckout = (storage: Storage = localStorage): CheckoutState => {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null') as Partial<CheckoutState> | null;
    if (!saved) return initialCheckout;
    const state: CheckoutState = { ...initialCheckout, ...saved, cardToken: null, busy: false, error: null };
    if (state.step === 'summary') state.step = 'payment';
    return state;
  } catch {
    return initialCheckout;
  }
};

export const saveCheckout = (state: CheckoutState, storage: Storage = localStorage) => {
  try {
    const { cardToken: _token, busy: _busy, error: _error, ...safe } = state;
    storage.setItem(KEY, JSON.stringify(safe));
  } catch {
    // Almacenamiento no disponible (modo privado): la app sigue funcionando sin persistencia.
  }
};

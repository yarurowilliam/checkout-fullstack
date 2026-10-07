import { useEffect, useState } from 'react';
import { formatCents } from '../domain/money';
import type { Transaction } from '../domain/types';
import { useAppDispatch, useAppSelector } from '../store';
import { finishCheckout, refreshTransaction, retryPayment } from '../store/checkoutSlice';
import { fetchProducts } from '../store/productsSlice';

export const POLL_MS = 3000;
export const REDIRECT_SECONDS = 10;

const COPY = {
  APPROVED: { icon: '✓', tone: 'success', title: '¡Pago aprobado!', text: 'Tu pedido fue asignado para entrega.' },
  DECLINED: { icon: '✕', tone: 'error', title: 'Pago rechazado', text: 'Tu banco rechazó la transacción. No se realizó ningún cobro.' },
  ERROR: { icon: '!', tone: 'error', title: 'No se pudo procesar el pago', text: 'Ocurrió un error con la pasarela. No se realizó ningún cobro.' },
  VOIDED: { icon: '!', tone: 'error', title: 'Pago anulado', text: 'La transacción fue anulada.' },
} as const;

const isFinal = (tx: Transaction | null) => Boolean(tx && tx.status !== 'PENDING');

export function ResultPage() {
  const dispatch = useAppDispatch();
  const { transaction: tx, busy, error } = useAppSelector((s) => s.checkout);
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);
  const processing = busy || (tx?.status === 'PENDING' && Boolean(tx.gatewayTransactionId));

  const backToStore = () => {
    dispatch(finishCheckout());
    dispatch(fetchProducts());
  };

  // Recupera el estado tras un refresh o mientras la pasarela lo resuelve.
  useEffect(() => {
    if (!tx || busy || tx.status !== 'PENDING') return;
    dispatch(refreshTransaction(tx.id));
    if (!tx.gatewayTransactionId) return;
    const timer = setInterval(() => dispatch(refreshTransaction(tx.id)), POLL_MS);
    return () => clearInterval(timer);
  }, [dispatch, tx?.id, tx?.status, tx?.gatewayTransactionId, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirige a la tienda unos segundos después de un estado final.
  const final = isFinal(tx);
  useEffect(() => {
    if (!final) return;
    const timer = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [final]);

  useEffect(() => {
    if (final && seconds <= 0) backToStore();
  }, [final, seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (processing) {
    return (
      <section className="result" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <h2>Procesando tu pago…</h2>
        <p>No cierres esta ventana. Si la recargas, recuperaremos el estado.</p>
      </section>
    );
  }

  if (!tx || tx.status === 'PENDING') {
    return (
      <section className="result" aria-live="polite">
        <div className="result-icon tone-error">!</div>
        <h2>El pago no se completó</h2>
        <p>{error ?? 'La transacción quedó pendiente de pago.'}</p>
        <button type="button" className="btn btn-primary" onClick={() => dispatch(retryPayment())}>
          Intentar de nuevo
        </button>
        <button type="button" className="btn btn-secondary" onClick={backToStore}>
          Volver a la tienda
        </button>
      </section>
    );
  }

  const copy = COPY[tx.status];
  return (
    <section className="result" aria-live="polite">
      <div className={`result-icon tone-${copy.tone}`}>{copy.icon}</div>
      <h2>{copy.title}</h2>
      <p>{copy.text}</p>
      <dl className="summary result-details">
        <div>
          <dt>Referencia</dt>
          <dd>{tx.reference}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatCents(tx.totalInCents)}</dd>
        </div>
        {tx.cardLastFour && (
          <div>
            <dt>Tarjeta</dt>
            <dd>
              {tx.cardBrand} •••• {tx.cardLastFour}
            </dd>
          </div>
        )}
        {tx.status === 'APPROVED' && (
          <div>
            <dt>Entrega</dt>
            <dd>
              {tx.delivery.address}, {tx.delivery.city}
            </dd>
          </div>
        )}
      </dl>
      <button type="button" className="btn btn-primary" onClick={backToStore}>
        Volver a la tienda
      </button>
      <p className="redirect-note">Te llevaremos a la tienda en {seconds} s</p>
    </section>
  );
}

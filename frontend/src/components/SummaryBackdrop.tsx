import { useEffect, useState } from 'react';
import { gateway, type Acceptance } from '../api/gateway';
import { formatCents } from '../domain/money';
import { useAppDispatch, useAppSelector } from '../store';
import { goTo, payTransaction } from '../store/checkoutSlice';
import { CardBrandLogo } from './CardBrandLogo';

/** Resumen de pago con el patrón "backdrop" de Material: capa trasera + hoja frontal. */
export function SummaryBackdrop() {
  const dispatch = useAppDispatch();
  const checkout = useAppSelector((s) => s.checkout);
  const product = useAppSelector((s) => s.products.items.find((p) => p.id === s.checkout.productId));
  const [accepted, setAccepted] = useState(false);
  const [links, setLinks] = useState<Pick<Acceptance, 'termsUrl' | 'personalDataUrl'> | null>(null);

  useEffect(() => {
    gateway
      .acceptance()
      .then(({ termsUrl, personalDataUrl }) => setLinks({ termsUrl, personalDataUrl }))
      .catch(() => setLinks(null));
  }, []);

  const { fees, quantity, card, delivery, busy, error } = checkout;
  if (!product || !fees || !card) return null;

  const amount = product.priceInCents * quantity;
  const total = amount + fees.baseFeeInCents + fees.deliveryFeeInCents;

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-label="Resumen de pago">
      <div className="backdrop-back">
        <button type="button" className="link-btn" onClick={() => dispatch(goTo('payment'))} disabled={busy}>
          ← Editar datos
        </button>
        <div className="backdrop-product">
          <img src={product.imageUrl} alt="" width={64} height={64} />
          <div>
            <p className="backdrop-title">{product.name}</p>
            <p className="backdrop-sub">
              {quantity} × {formatCents(product.priceInCents)}
            </p>
          </div>
        </div>
      </div>

      <section className="backdrop-front">
        <h2>Resumen de pago</h2>
        <dl className="summary">
          <div>
            <dt>Producto</dt>
            <dd>{formatCents(amount)}</dd>
          </div>
          <div>
            <dt>Tarifa base</dt>
            <dd>{formatCents(fees.baseFeeInCents)}</dd>
          </div>
          <div>
            <dt>Envío</dt>
            <dd>{formatCents(fees.deliveryFeeInCents)}</dd>
          </div>
          <div className="summary-total">
            <dt>Total</dt>
            <dd>{formatCents(total)}</dd>
          </div>
        </dl>

        <div className="summary-details">
          <p className="summary-card">
            <CardBrandLogo brand={card.brand} />
            <span>
              •••• {card.lastFour} · {card.installments} {card.installments === 1 ? 'cuota' : 'cuotas'}
            </span>
          </p>
          <p className="summary-address">
            Enviar a: {delivery.address}, {delivery.city}, {delivery.region}
          </p>
        </div>

        <label className="terms">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            Acepto el{' '}
            {links ? (
              <a href={links.termsUrl} target="_blank" rel="noopener noreferrer">
                reglamento de uso
              </a>
            ) : (
              'reglamento de uso'
            )}{' '}
            y la{' '}
            {links ? (
              <a href={links.personalDataUrl} target="_blank" rel="noopener noreferrer">
                autorización de tratamiento de datos personales
              </a>
            ) : (
              'autorización de tratamiento de datos personales'
            )}
            .
          </span>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="button" className="btn btn-primary" disabled={!accepted || busy} onClick={() => dispatch(payTransaction())}>
          {busy ? 'Procesando…' : `Pagar ${formatCents(total)}`}
        </button>
      </section>
    </div>
  );
}

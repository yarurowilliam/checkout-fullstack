import { useState } from 'react';
import { formatCents } from '../domain/money';
import type { Product } from '../domain/types';
import { useAppDispatch, useAppSelector } from '../store';
import { startCheckout } from '../store/checkoutSlice';
import { fetchProducts } from '../store/productsSlice';

const MAX_PER_ORDER = 10;

function ProductCard({ product, priority }: { product: Product; priority: boolean }) {
  const dispatch = useAppDispatch();
  const [quantity, setQuantity] = useState(1);
  const max = Math.min(product.stock, MAX_PER_ORDER);
  const soldOut = product.stock === 0;
  const qty = Math.min(quantity, Math.max(max, 1));

  return (
    <article className="product-card">
      <img
        className="product-image"
        src={product.imageUrl}
        alt={product.name}
        width={600}
        height={600}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
      />
      <div className="product-body">
        <h2 className="product-name">{product.name}</h2>
        <p className="product-description">{product.description}</p>
        <div className="product-meta">
          <span className="product-price">{formatCents(product.priceInCents)}</span>
          <span className={`stock-badge ${soldOut ? 'is-out' : ''}`}>
            {soldOut ? 'Agotado' : `${product.stock} disponibles`}
          </span>
        </div>
        {!soldOut && (
          <div className="quantity" role="group" aria-label={`Cantidad de ${product.name}`}>
            <button type="button" onClick={() => setQuantity(qty - 1)} disabled={qty <= 1} aria-label="Quitar uno">
              −
            </button>
            <output aria-live="polite">{qty}</output>
            <button type="button" onClick={() => setQuantity(qty + 1)} disabled={qty >= max} aria-label="Agregar uno">
              +
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={soldOut}
          onClick={() => dispatch(startCheckout({ productId: product.id, quantity: qty }))}
        >
          Pagar con tarjeta de crédito
        </button>
      </div>
    </article>
  );
}

export function ProductPage() {
  const dispatch = useAppDispatch();
  const { items, status, error } = useAppSelector((s) => s.products);

  if (status === 'error') {
    return (
      <div className="state-message" role="alert">
        <p>{error}</p>
        <button type="button" className="btn btn-secondary" onClick={() => dispatch(fetchProducts())}>
          Reintentar
        </button>
      </div>
    );
  }

  if (status !== 'ready' && items.length === 0) {
    return (
      <div className="product-grid" aria-busy="true" aria-label="Cargando productos">
        <div className="product-card skeleton" />
        <div className="product-card skeleton" />
      </div>
    );
  }

  return (
    <section className="product-grid" aria-label="Productos">
      {items.map((product, i) => (
        <ProductCard key={product.id} product={product} priority={i === 0} />
      ))}
    </section>
  );
}

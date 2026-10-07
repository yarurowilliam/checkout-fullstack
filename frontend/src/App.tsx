import { useEffect } from 'react';
import { PaymentModal } from './components/PaymentModal';
import { ProductPage } from './components/ProductPage';
import { ResultPage } from './components/ResultPage';
import { SummaryBackdrop } from './components/SummaryBackdrop';
import { useAppDispatch, useAppSelector } from './store';
import { loadFees } from './store/checkoutSlice';
import { fetchProducts } from './store/productsSlice';

const STEPS = ['product', 'payment', 'summary', 'result'] as const;
const STEP_LABELS = { product: 'Producto', payment: 'Pago y entrega', summary: 'Resumen', result: 'Resultado' };

export default function App() {
  const dispatch = useAppDispatch();
  const step = useAppSelector((s) => s.checkout.step);
  // Con un diálogo abierto el fondo no debe recibir foco ni clics.
  const overlayOpen = step === 'payment' || step === 'summary';

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(loadFees());
  }, [dispatch]);

  return (
    <div className="app">
      <header className="app-header" inert={overlayOpen}>
        <span className="logo">Tienda</span>
        <ol className="steps" aria-label="Progreso de la compra">
          {STEPS.map((s, i) => (
            <li key={s} className={STEPS.indexOf(step) >= i ? 'is-done' : ''} aria-current={s === step ? 'step' : undefined}>
              <span className="sr-only">{STEP_LABELS[s]}</span>
            </li>
          ))}
        </ol>
      </header>
      <main className="app-main" inert={overlayOpen}>{step === 'result' ? <ResultPage /> : <ProductPage />}</main>
      {step === 'payment' && <PaymentModal />}
      {step === 'summary' && <SummaryBackdrop />}
    </div>
  );
}

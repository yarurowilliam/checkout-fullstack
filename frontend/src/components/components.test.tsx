import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { acceptance, fakeExtra, product, renderWithStore, transaction } from '../test/utils';
import { startCheckout, submitPaymentForm, transactionStarted } from '../store/checkoutSlice';
import { CardBrandLogo } from './CardBrandLogo';
import { PaymentModal } from './PaymentModal';
import { ProductPage } from './ProductPage';
import { POLL_MS, REDIRECT_SECONDS, ResultPage } from './ResultPage';
import { SummaryBackdrop } from './SummaryBackdrop';

const mockAcceptance = jest.fn();
jest.mock('../api/gateway', () => ({ gateway: { acceptance: () => mockAcceptance() } }));

beforeEach(() => {
  localStorage.clear();
  mockAcceptance.mockResolvedValue(acceptance);
});

const fillForm = async (user: ReturnType<typeof userEvent.setup>, overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    'Número de tarjeta': '4242424242424242',
    'Nombre en la tarjeta': 'Ana Perez',
    'Vence (MM/AA)': '0830',
    CVC: '123',
    'Nombre completo': 'Ana Pérez',
    Email: 'ana@test.com',
    Teléfono: '3001234567',
    Dirección: 'Calle 10 # 20-30',
    Ciudad: 'Bogotá',
    Departamento: 'Cundinamarca',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    const input = screen.getByLabelText(label, { exact: false });
    await user.clear(input);
    if (value) await user.type(input, value);
  }
};

describe('flujo completo', () => {
  it('compra un producto: producto → tarjeta → resumen → resultado → tienda', async () => {
    const user = userEvent.setup();
    const { extra, store } = renderWithStore(<App />);

    expect(await screen.findByText('Audífonos')).toBeInTheDocument();
    expect(screen.getByText('3 disponibles')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar uno' }));
    await user.click(screen.getByRole('button', { name: 'Pagar con tarjeta de crédito' }));

    const dialog = screen.getByRole('dialog', { name: 'Pago con tarjeta' });
    await fillForm(user);
    expect(within(dialog).getByRole('img', { name: 'VISA' })).toBeInTheDocument();
    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('4242 4242 4242 4242');
    await user.selectOptions(screen.getByLabelText('Cuotas'), '3');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const summary = await screen.findByRole('dialog', { name: 'Resumen de pago' });
    expect(within(summary).getByText('Producto').nextSibling).toHaveTextContent('379.800');
    expect(within(summary).getByText('Total').nextSibling).toHaveTextContent('389.800');
    expect(within(summary).getByText(/•••• 4242 · 3 cuotas/)).toBeInTheDocument();
    expect(await within(summary).findByRole('link', { name: 'reglamento de uso' })).toHaveAttribute('href', 'https://terms');

    const pay = within(summary).getByRole('button', { name: /Pagar/ });
    expect(pay).toBeDisabled();
    await user.click(within(summary).getByRole('checkbox'));
    await user.click(pay);

    expect(await screen.findByText('¡Pago aprobado!')).toBeInTheDocument();
    expect(extra.backend.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }));
    expect(extra.backend.pay).toHaveBeenCalledWith('t1', expect.objectContaining({ installments: 3 }));

    await user.click(screen.getByRole('button', { name: 'Volver a la tienda' }));
    expect(store.getState().checkout.step).toBe('product');
    expect(extra.backend.products).toHaveBeenCalledTimes(2);
  });
});

describe('ProductPage', () => {
  it('muestra un esqueleto mientras carga', () => {
    renderWithStore(<ProductPage />);
    expect(screen.getByLabelText('Cargando productos')).toHaveAttribute('aria-busy', 'true');
  });

  it('muestra el error y permite reintentar', async () => {
    const extra = fakeExtra();
    extra.backend.products.mockRejectedValueOnce(new Error('Sin conexión'));
    renderWithStore(<App />, extra);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Audífonos')).toBeInTheDocument();
  });

  it('deshabilita la compra de productos agotados y limita la cantidad al stock', async () => {
    const extra = fakeExtra();
    extra.backend.products.mockResolvedValue([
      { ...product, id: 'a', name: 'Agotado', stock: 0 },
      { ...product, id: 'b', name: 'Último', stock: 1 },
    ]);
    renderWithStore(<App />, extra);
    expect(await screen.findByText('Agotado', { selector: '.stock-badge' })).toBeInTheDocument();
    const [soldOut, last] = screen.getAllByRole('button', { name: 'Pagar con tarjeta de crédito' });
    expect(soldOut).toBeDisabled();
    expect(last).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Agregar uno' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitar uno' })).toBeDisabled();
  });
});

describe('PaymentModal', () => {
  const open = () => {
    const ctx = renderWithStore(<PaymentModal />);
    act(() => {
      ctx.store.dispatch(startCheckout({ productId: 'p1', quantity: 1 }));
    });
    return ctx;
  };

  it('muestra errores de validación y no tokeniza', async () => {
    const user = userEvent.setup();
    const { extra } = open();
    await fillForm(user, { 'Número de tarjeta': '4242424242424241', CVC: '1', 'Código postal': '12' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Número de tarjeta inválido')).toBeInTheDocument();
    expect(screen.getByText('CVC de 3 o 4 dígitos')).toBeInTheDocument();
    expect(screen.getByText('Código postal de 6 dígitos')).toBeInTheDocument();
    expect(screen.getByLabelText('Número de tarjeta')).toHaveAttribute('aria-invalid', 'true');
    expect(extra.gateway.tokenizeCard).not.toHaveBeenCalled();

    // El error de un campo se limpia al editarlo.
    await user.type(screen.getByLabelText('CVC'), '23');
    expect(screen.queryByText('CVC de 3 o 4 dígitos')).not.toBeInTheDocument();
  });

  it('muestra el error de la pasarela al tokenizar', async () => {
    const user = userEvent.setup();
    const { extra } = open();
    extra.gateway.tokenizeCard.mockRejectedValueOnce(new Error('Tarjeta rechazada'));
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tarjeta rechazada');
  });

  it('se cierra con Escape, con el botón y al tocar fuera', async () => {
    const { store } = open();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(store.getState().checkout.step).toBe('payment');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.getState().checkout.step).toBe('product');

    act(() => {
      store.dispatch(startCheckout({ productId: 'p1', quantity: 1 }));
    });
    fireEvent.click(screen.getByRole('dialog'));
    expect(store.getState().checkout.step).toBe('payment');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(store.getState().checkout.step).toBe('product');

    act(() => {
      store.dispatch(startCheckout({ productId: 'p1', quantity: 1 }));
    });
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(store.getState().checkout.step).toBe('product');
  });
});

describe('SummaryBackdrop', () => {
  const openSummary = async () => {
    const ctx = renderWithStore(<SummaryBackdrop />);
    await act(async () => {
      await ctx.store.dispatch({ type: 'products/fetch/fulfilled', payload: [product] });
      await ctx.store.dispatch({ type: 'checkout/fees/fulfilled', payload: { baseFeeInCents: 200000, deliveryFeeInCents: 800000 } });
      ctx.store.dispatch(startCheckout({ productId: 'p1', quantity: 1 }));
      await ctx.store.dispatch(
        submitPaymentForm({
          card: { number: '4242424242424242', cvc: '123', expMonth: '08', expYear: '30', holder: 'Ana' },
          installments: 1,
          customer: { fullName: 'Ana', email: 'a@b.co', phone: '300' },
          delivery: { address: 'Calle 1', city: 'Bogotá', region: 'Cund', postalCode: '' },
        }),
      );
    });
    return ctx;
  };

  it('muestra los términos sin enlace si la pasarela no responde y permite editar', async () => {
    mockAcceptance.mockRejectedValueOnce(new Error('caída'));
    const { store } = await openSummary();
    expect(screen.getByText(/1 cuota$/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← Editar datos' }));
    expect(store.getState().checkout.step).toBe('payment');
  });

  it('muestra el error del pago', async () => {
    const { store, extra } = await openSummary();
    extra.backend.createTransaction.mockRejectedValueOnce(new Error('No hay unidades suficientes'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Pagar/ }));
    await waitFor(() => expect(store.getState().checkout.error).toBe('No hay unidades suficientes'));
    expect(screen.getByRole('alert')).toHaveTextContent('No hay unidades suficientes');
  });

  it('no se muestra sin datos completos', () => {
    const { container } = renderWithStore(<SummaryBackdrop />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ResultPage', () => {
  afterEach(() => jest.useRealTimers());

  const showResult = (tx = transaction()) => {
    const ctx = renderWithStore(<ResultPage />);
    act(() => {
      ctx.store.dispatch(transactionStarted(tx));
    });
    return ctx;
  };

  it.each([
    ['DECLINED', 'Pago rechazado'],
    ['ERROR', 'No se pudo procesar el pago'],
    ['VOIDED', 'Pago anulado'],
  ] as const)('muestra el estado %s', (status, title) => {
    showResult(transaction({ status }));
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText('Entrega')).not.toBeInTheDocument();
  });

  it('consulta el estado mientras la pasarela lo procesa', async () => {
    jest.useFakeTimers();
    const { extra } = showResult(transaction({ gatewayTransactionId: 'g1' }));
    expect(screen.getByText('Procesando tu pago…')).toBeInTheDocument();
    extra.backend.transaction.mockResolvedValue(transaction({ status: 'APPROVED', gatewayTransactionId: 'g1' }));
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS);
    });
    expect(screen.getByText('¡Pago aprobado!')).toBeInTheDocument();
    expect(extra.backend.transaction).toHaveBeenCalledWith('t1');
  });

  it('ofrece reintentar si la transacción no llegó a la pasarela', async () => {
    const { store } = showResult();
    expect(await screen.findByText('El pago no se completó')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(store.getState().checkout.step).toBe('payment');
  });

  it('redirige a la tienda tras un estado final', async () => {
    jest.useFakeTimers();
    const { store } = showResult(transaction({ status: 'APPROVED', cardBrand: 'VISA', cardLastFour: '4242' }));
    expect(screen.getByText(`Te llevaremos a la tienda en ${REDIRECT_SECONDS} s`)).toBeInTheDocument();
    expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(REDIRECT_SECONDS * 1000);
    });
    expect(store.getState().checkout.step).toBe('product');
  });
});

describe('CardBrandLogo', () => {
  it('no muestra logo para marcas desconocidas', () => {
    const { container } = renderWithStore(<CardBrandLogo brand={null} />);
    expect(container).toBeEmptyDOMElement();
    renderWithStore(<CardBrandLogo brand="MASTERCARD" />);
    expect(screen.getByRole('img', { name: 'MasterCard' })).toBeInTheDocument();
  });
});

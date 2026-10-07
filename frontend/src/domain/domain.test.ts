import { detectBrand, formatCardNumber, formatExpiry, isValidCvc, isValidExpiry, isValidLuhn } from './card';
import { formatCents } from './money';
import { validatePaymentForm, type FormValues } from './validation';

describe('tarjeta', () => {
  it.each([
    ['4242 4242 4242 4242', 'VISA'],
    ['5555555555554444', 'MASTERCARD'],
    ['2221000000000009', 'MASTERCARD'],
    ['378282246310005', null],
    ['', null],
  ])('detecta la marca de %s', (number, brand) => {
    expect(detectBrand(number)).toBe(brand);
  });

  it('valida con Luhn y longitud', () => {
    expect(isValidLuhn('4242 4242 4242 4242')).toBe(true);
    expect(isValidLuhn('4242424242424241')).toBe(false);
    expect(isValidLuhn('4242')).toBe(false);
  });

  it('formatea número y vencimiento mientras se escribe', () => {
    expect(formatCardNumber('4242abc42424242424299')).toBe('4242 4242 4242 4242');
    expect(formatExpiry('08')).toBe('08');
    expect(formatExpiry('0829')).toBe('08/29');
  });

  it('valida el vencimiento contra la fecha actual', () => {
    const now = new Date(2026, 9, 7);
    expect(isValidExpiry('10/26', now)).toBe(true);
    expect(isValidExpiry('09/26', now)).toBe(false);
    expect(isValidExpiry('01/27', now)).toBe(true);
    expect(isValidExpiry('13/30', now)).toBe(false);
    expect(isValidExpiry('1/30', now)).toBe(false);
  });

  it('valida el CVC', () => {
    expect(isValidCvc('123')).toBe(true);
    expect(isValidCvc('1234')).toBe(true);
    expect(isValidCvc('12')).toBe(false);
  });
});

describe('dinero', () => {
  it('formatea centavos en pesos colombianos sin decimales', () => {
    expect(formatCents(19990000).replace(/\s/g, ' ')).toBe('$ 199.900');
  });
});

describe('validatePaymentForm', () => {
  const valid: FormValues = {
    cardNumber: '4242 4242 4242 4242',
    holder: 'Ana Perez',
    expiry: '08/29',
    cvc: '123',
    installments: 1,
    fullName: 'Ana Pérez',
    email: 'ana@test.com',
    phone: '300 123 4567',
    address: 'Calle 10 # 20-30',
    city: 'Bogotá',
    region: 'Cundinamarca',
    postalCode: '',
  };
  const now = new Date(2026, 9, 7);

  it('no reporta errores con datos válidos', () => {
    expect(validatePaymentForm(valid, now)).toEqual({});
  });

  it('reporta cada campo inválido', () => {
    const errors = validatePaymentForm(
      {
        ...valid,
        cardNumber: '1234',
        holder: 'A1',
        expiry: '01/20',
        cvc: '1',
        fullName: 'A',
        email: 'ana@',
        phone: '12',
        address: 'x',
        city: '',
        region: '',
        postalCode: '12',
      },
      now,
    );
    expect(Object.keys(errors).sort()).toEqual(
      ['address', 'cardNumber', 'city', 'cvc', 'email', 'expiry', 'fullName', 'holder', 'phone', 'postalCode', 'region'].sort(),
    );
  });

  it('rechaza marcas distintas de VISA y MasterCard', () => {
    expect(validatePaymentForm({ ...valid, cardNumber: '378282246310005' }, now).cardNumber).toMatch(/VISA y MasterCard/);
  });
});

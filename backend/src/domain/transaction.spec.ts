import { calculateAmounts, calculateTax, IVA_RATE } from './transaction';

describe('IVA', () => {
  const fees = { baseFeeInCents: 200000, deliveryFeeInCents: 800000 };

  it('la tarifa es del 19%', () => {
    expect(IVA_RATE).toBe(0.19);
  });

  it('calcula el IVA sobre el valor de los productos', () => {
    expect(calculateTax(10000000)).toBe(1900000);
  });

  it('redondea al centavo entero más cercano', () => {
    expect(calculateTax(1)).toBe(0);
    expect(calculateTax(3)).toBe(1); // 0.57
    expect(calculateTax(1005)).toBe(191); // 190.95
  });

  it('el total suma productos, IVA, tarifa base y envío', () => {
    expect(calculateAmounts(18990000, 2, fees)).toEqual({
      amountInCents: 37980000,
      taxInCents: 7216200,
      ...fees,
      totalInCents: 37980000 + 7216200 + 200000 + 800000,
    });
  });

  it('el IVA no se aplica sobre las tarifas', () => {
    const { taxInCents } = calculateAmounts(10000, 1, { baseFeeInCents: 999999, deliveryFeeInCents: 999999 });
    expect(taxInCents).toBe(1900);
  });
});

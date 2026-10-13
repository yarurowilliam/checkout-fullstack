const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const formatCents = (cents: number) => cop.format(cents / 100);

/**
 * Desglose del resumen de pago. Debe coincidir con calculateAmounts del backend:
 * el IVA se calcula sobre el valor de los productos y se redondea al centavo.
 */
export const summarize = (amountInCents: number, fees: { baseFeeInCents: number; deliveryFeeInCents: number; taxRate: number }) => {
  const taxInCents = Math.round(amountInCents * fees.taxRate);
  return {
    amountInCents,
    taxInCents,
    totalInCents: amountInCents + taxInCents + fees.baseFeeInCents + fees.deliveryFeeInCents,
  };
};

export const formatPercent = (rate: number) => `${Math.round(rate * 100)}%`;

export type CardBrand = 'VISA' | 'MASTERCARD' | null;

export const digitsOnly = (value: string) => value.replace(/\D/g, '');

export const detectBrand = (number: string): CardBrand => {
  const n = digitsOnly(number);
  if (/^4/.test(n)) return 'VISA';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'MASTERCARD';
  return null;
};

/** Algoritmo de Luhn: detecta errores de digitación en el número de tarjeta. */
export const isValidLuhn = (number: string): boolean => {
  const n = digitsOnly(number);
  if (n.length < 13 || n.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
};

export const formatCardNumber = (value: string) =>
  digitsOnly(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

export const formatExpiry = (value: string) => {
  const n = digitsOnly(value).slice(0, 4);
  return n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
};

/** MM/AA vigente: el mes actual todavía es válido. */
export const isValidExpiry = (value: string, now = new Date()): boolean => {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
};

export const isValidCvc = (value: string) => /^\d{3,4}$/.test(value);

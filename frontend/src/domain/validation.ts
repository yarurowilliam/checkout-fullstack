import { detectBrand, digitsOnly, isValidCvc, isValidExpiry, isValidLuhn } from './card';
import type { CustomerData, DeliveryData } from './types';

export interface FormValues extends CustomerData, DeliveryData {
  cardNumber: string;
  holder: string;
  expiry: string;
  cvc: string;
  installments: number;
}

export type FormErrors = Partial<Record<keyof FormValues, string>>;

const lengthBetween = (value: string, min: number, max: number) => {
  const length = value.trim().length;
  return length >= min && length <= max;
};

export const validatePaymentForm = (v: FormValues, now = new Date()): FormErrors => {
  const errors: FormErrors = {};
  if (!isValidLuhn(v.cardNumber)) errors.cardNumber = 'Número de tarjeta inválido';
  else if (!detectBrand(v.cardNumber)) errors.cardNumber = 'Solo aceptamos VISA y MasterCard';
  if (!/^[a-zA-ZÀ-ÿ ]{5,60}$/.test(v.holder.trim())) errors.holder = 'Nombre como aparece en la tarjeta';
  if (!isValidExpiry(v.expiry, now)) errors.expiry = 'Fecha inválida o vencida';
  if (!isValidCvc(v.cvc)) errors.cvc = 'CVC de 3 o 4 dígitos';
  if (!lengthBetween(v.fullName, 3, 100)) errors.fullName = 'Ingresa tu nombre completo';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) errors.email = 'Email inválido';
  if (!/^\+?\d{7,15}$/.test(digitsOnly(v.phone))) errors.phone = 'Teléfono de 7 a 15 dígitos';
  if (!lengthBetween(v.address, 5, 150)) errors.address = 'Dirección muy corta';
  if (!lengthBetween(v.city, 2, 60)) errors.city = 'Ciudad requerida';
  if (!lengthBetween(v.region, 2, 60)) errors.region = 'Departamento requerido';
  if (v.postalCode && !/^\d{6}$/.test(v.postalCode)) errors.postalCode = 'Código postal de 6 dígitos';
  return errors;
};

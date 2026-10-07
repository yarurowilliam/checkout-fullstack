import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { detectBrand, digitsOnly, formatCardNumber, formatExpiry } from '../domain/card';
import { validatePaymentForm, type FormErrors, type FormValues } from '../domain/validation';
import { useAppDispatch, useAppSelector } from '../store';
import { goTo, submitPaymentForm } from '../store/checkoutSlice';
import { CardBrandLogo } from './CardBrandLogo';

const INSTALLMENTS = [1, 2, 3, 6, 12, 24, 36];

interface FieldProps {
  name: keyof FormValues;
  label: string;
  values: FormValues;
  errors: FormErrors;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  inputMode?: 'numeric' | 'email' | 'tel' | 'text';
  placeholder?: string;
  type?: string;
  maxLength?: number;
  optional?: boolean;
}

function Field({ name, label, values, errors, optional, ...input }: FieldProps) {
  const id = useId();
  const error = errors[name];
  return (
    <div className={`field field-${name}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="optional"> (opcional)</span>}
      </label>
      <input
        id={id}
        name={name}
        value={String(values[name])}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

export function PaymentModal() {
  const dispatch = useAppDispatch();
  const { customer, delivery, busy, error, card } = useAppSelector((s) => s.checkout);
  const titleId = useId();
  const [values, setValues] = useState<FormValues>({
    cardNumber: '',
    holder: card?.holder ?? '',
    expiry: '',
    cvc: '',
    installments: card?.installments ?? 1,
    ...customer,
    ...delivery,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const brand = detectBrand(values.cardNumber);

  const close = () => dispatch(goTo('product'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dispatch(goTo('product'));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const formatted =
      name === 'cardNumber'
        ? formatCardNumber(value)
        : name === 'expiry'
          ? formatExpiry(value)
          : name === 'cvc' || name === 'postalCode'
            ? digitsOnly(value)
            : name === 'installments'
              ? Number(value)
              : value;
    setValues((v) => ({ ...v, [name]: formatted }));
    if (errors[name as keyof FormValues]) setErrors((err) => ({ ...err, [name]: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const found = validatePaymentForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const [month, year] = values.expiry.split('/');
    dispatch(
      submitPaymentForm({
        card: { number: digitsOnly(values.cardNumber), cvc: values.cvc, expMonth: month, expYear: year, holder: values.holder.trim() },
        installments: values.installments,
        customer: { fullName: values.fullName.trim(), email: values.email.trim(), phone: digitsOnly(values.phone) },
        delivery: {
          address: values.address.trim(),
          city: values.city.trim(),
          region: values.region.trim(),
          postalCode: values.postalCode,
        },
      }),
    );
  };

  const field = { values, errors, onChange };

  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id={titleId}>Pago con tarjeta</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar">
            ×
          </button>
        </header>

        <form className="modal-body" onSubmit={onSubmit} noValidate>
          <fieldset>
            <legend>Tarjeta de crédito</legend>
            <div className="card-number-wrap">
              <Field name="cardNumber" label="Número de tarjeta" autoComplete="cc-number" inputMode="numeric" placeholder="0000 0000 0000 0000" maxLength={19} {...field} />
              <span className="card-brand" aria-live="polite">
                <CardBrandLogo brand={brand} />
              </span>
            </div>
            <Field name="holder" label="Nombre en la tarjeta" autoComplete="cc-name" placeholder="Como aparece en la tarjeta" {...field} />
            <div className="row">
              <Field name="expiry" label="Vence (MM/AA)" autoComplete="cc-exp" inputMode="numeric" placeholder="MM/AA" maxLength={5} {...field} />
              <Field name="cvc" label="CVC" autoComplete="cc-csc" inputMode="numeric" placeholder="123" maxLength={4} type="password" {...field} />
            </div>
            <div className="field">
              <label htmlFor="installments">Cuotas</label>
              <select id="installments" name="installments" value={values.installments} onChange={onChange}>
                {INSTALLMENTS.map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'cuota' : 'cuotas'}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset>
            <legend>Datos de entrega</legend>
            <Field name="fullName" label="Nombre completo" autoComplete="name" {...field} />
            <div className="row">
              <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email" {...field} />
              <Field name="phone" label="Teléfono" type="tel" autoComplete="tel" inputMode="tel" {...field} />
            </div>
            <Field name="address" label="Dirección" autoComplete="street-address" {...field} />
            <div className="row">
              <Field name="city" label="Ciudad" autoComplete="address-level2" {...field} />
              <Field name="region" label="Departamento" autoComplete="address-level1" {...field} />
            </div>
            <Field name="postalCode" label="Código postal" autoComplete="postal-code" inputMode="numeric" maxLength={6} optional {...field} />
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Validando tarjeta…' : 'Continuar'}
          </button>
          <p className="secure-note">Los datos de tu tarjeta se envían cifrados directamente a la pasarela de pagos.</p>
        </form>
      </div>
    </div>
  );
}

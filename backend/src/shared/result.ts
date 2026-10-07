// Railway Oriented Programming: cada paso devuelve Ok o Err y la cadena
// se corta en el primer Err sin lanzar excepciones.

export type ErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'OUT_OF_STOCK' | 'GATEWAY' | 'CONFLICT';

export interface AppError {
  code: ErrorCode;
  message: string;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = (code: ErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});

export const fromNullable = <T>(value: T | null | undefined, code: ErrorCode, message: string): Result<T> =>
  value === null || value === undefined ? err(code, message) : ok(value);

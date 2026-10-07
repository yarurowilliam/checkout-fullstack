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

export const ensure = <T>(value: T, condition: boolean, code: ErrorCode, message: string): Result<T> =>
  condition ? ok(value) : err(code, message);

type Awaitable<T> = T | Promise<T>;

// Encadena pasos asíncronos sobre el riel de éxito; un Err salta el resto.
export class Flow<T> {
  private constructor(private readonly current: Promise<Result<T>>) {}

  static from<T>(result: Awaitable<Result<T>>): Flow<T> {
    return new Flow(Promise.resolve(result));
  }

  andThen<U>(step: (value: T) => Awaitable<Result<U>>): Flow<U> {
    return new Flow(this.current.then((r) => (r.ok ? step(r.value) : r)));
  }

  map<U>(step: (value: T) => Awaitable<U>): Flow<U> {
    return this.andThen(async (value) => ok(await step(value)));
  }

  run(): Promise<Result<T>> {
    return this.current;
  }
}

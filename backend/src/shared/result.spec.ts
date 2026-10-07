import { ensure, err, Flow, fromNullable, ok } from './result';

describe('Result', () => {
  it('ok envuelve el valor', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  it('err envuelve el código y el mensaje', () => {
    expect(err('NOT_FOUND', 'x')).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'x' } });
  });

  it('fromNullable distingue valores presentes de null/undefined', () => {
    expect(fromNullable(0, 'NOT_FOUND', 'x')).toEqual(ok(0));
    expect(fromNullable(null, 'NOT_FOUND', 'x').ok).toBe(false);
    expect(fromNullable(undefined, 'NOT_FOUND', 'x').ok).toBe(false);
  });

  it('ensure valida una condición', () => {
    expect(ensure(1, true, 'VALIDATION', 'x')).toEqual(ok(1));
    expect(ensure(1, false, 'VALIDATION', 'x')).toEqual(err('VALIDATION', 'x'));
  });
});

describe('Flow', () => {
  it('encadena pasos síncronos y asíncronos en el riel de éxito', async () => {
    const result = await Flow.from(ok(2))
      .andThen((n) => ok(n * 3))
      .andThen(async (n) => ok(n + 1))
      .map(async (n) => `v${n}`)
      .run();
    expect(result).toEqual(ok('v7'));
  });

  it('se detiene en el primer error y no ejecuta los pasos siguientes', async () => {
    const next = jest.fn();
    const result = await Flow.from(Promise.resolve(ok(1)))
      .andThen(() => err('CONFLICT', 'stop'))
      .map(next)
      .run();
    expect(result).toEqual(err('CONFLICT', 'stop'));
    expect(next).not.toHaveBeenCalled();
  });
});

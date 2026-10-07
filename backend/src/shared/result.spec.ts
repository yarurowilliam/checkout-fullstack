import { err, fromNullable, ok } from './result';

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
});

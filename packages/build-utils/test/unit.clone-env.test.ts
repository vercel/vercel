import { it, expect } from 'vitest';
import { cloneEnv } from '../src';

it('should clone env with Path', () => {
  expect(
    cloneEnv(
      new Proxy(
        {
          foo: 'bar',
          Path: 'baz',
        },
        {
          get(target: typeof process.env, prop: string) {
            if (prop === 'PATH') {
              return target.PATH ?? target.Path;
            }
            return target[prop];
          },
        }
      )
    )
  ).toEqual({
    foo: 'bar',
    PATH: 'baz',
  });
});

it('should clone env with PATH', () => {
  expect(
    cloneEnv({
      foo: 'bar',
      PATH: 'baz',
    })
  ).toEqual({
    foo: 'bar',
    PATH: 'baz',
  });
});

it('should not overwrite PATH when path is undefined', () => {
  expect(
    cloneEnv(
      {
        PATH: 'baz',
      },
      new Proxy(
        {
          Path: undefined,
        },
        {
          get(target: typeof process.env, prop: string) {
            if (prop === 'PATH') {
              return target.PATH ?? target.Path;
            }
            return target[prop];
          },
        }
      )
    )
  ).toEqual({
    PATH: 'baz',
  });
});

it('should clone and merge multiple env objects', () => {
  // note: this also tests the last object doesn't overwrite `PATH` with
  // `undefined`
  expect(
    cloneEnv(
      {
        foo: 'bar',
      },
      {
        PATH: 'baz',
      },
      {
        baz: 'wiz',
      }
    )
  ).toEqual({
    foo: 'bar',
    PATH: 'baz',
    baz: 'wiz',
  });
});

it('should clone the actual process.env object', () => {
  expect(cloneEnv(process.env).PATH).toEqual(process.env.PATH);
});

it('should overwrite PATH with last value', () => {
  expect(
    cloneEnv(
      new Proxy(
        {
          Path: 'foo',
        },
        {
          get(target: typeof process.env, prop: string) {
            if (prop === 'PATH') {
              return target.PATH ?? target.Path;
            }
            return target[prop];
          },
        }
      ),
      {
        PATH: 'bar',
      },
      {
        PATH: undefined,
      }
    )
  ).toEqual({
    PATH: undefined,
  });
});

it('should not allow prototype pollution via __proto__ key', () => {
  // Regression test for #15725.  A malicious env containing a `__proto__`
  // own property (e.g. produced by `JSON.parse`) must not be allowed to
  // replace the returned object's prototype with attacker-controlled data,
  // and must not pollute `Object.prototype`.
  const malicious = JSON.parse(
    '{"__proto__":{"polluted":"yes"},"GOOD":"keep"}'
  );
  const result = cloneEnv(malicious) as Record<string, unknown>;

  // Returned object's prototype must remain Object.prototype.
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  // Looking up `polluted` must not surface the attacker value via the chain.
  expect(result.polluted).toBeUndefined();
  // The unsafe key itself must not be copied as a regular own property.
  expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
  // Legitimate keys are still copied.
  expect(result.GOOD).toBe('keep');
  // `Object.prototype` was not globally polluted.
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

it('should not copy other unsafe keys (constructor, prototype)', () => {
  const malicious = JSON.parse(
    '{"constructor":"x","prototype":"y","SAFE":"keep"}'
  );
  const result = cloneEnv(malicious);
  expect(result).toEqual({ SAFE: 'keep' });
});

it('should handle process.env at any argument position', () => {
  expect(
    cloneEnv(
      {
        foo: 'bar',
      },
      new Proxy(
        {
          Path: 'baz',
        },
        {
          get(target: typeof process.env, prop: string) {
            if (prop === 'PATH') {
              return target.PATH ?? target.Path;
            }
            return target[prop];
          },
        }
      )
    )
  ).toEqual({
    foo: 'bar',
    PATH: 'baz',
  });
});

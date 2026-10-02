import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, describe, expect, test } from 'vitest';
import { getPassportToken, PASSPORT_HEADER_NAME } from '../../src';

const symbol = Symbol.for('@vercel/request-context');
const original = Object.getOwnPropertyDescriptor(globalThis, symbol);

afterEach(() => {
  if (original) {
    Object.defineProperty(globalThis, symbol, original);
  } else {
    Reflect.deleteProperty(globalThis, symbol);
  }
});

describe('getPassportToken', () => {
  test('reads the context token without verifying or decoding it', () => {
    Object.defineProperty(globalThis, symbol, {
      configurable: true,
      value: {
        get: () => ({ headers: { [PASSPORT_HEADER_NAME]: 'opaque-token' } }),
      },
    });
    expect(getPassportToken()).toBe('opaque-token');
  });

  test.each([
    undefined,
    {},
    { headers: {} },
    { headers: { cookie: '_vercel_passport=cookie-token' } },
  ])('returns null without a context token (%j)', context => {
    Object.defineProperty(globalThis, symbol, {
      configurable: true,
      value: { get: () => context },
    });
    expect(getPassportToken()).toBeNull();
  });

  test('returns null when the runtime context is unavailable', () => {
    Reflect.deleteProperty(globalThis, symbol);
    expect(getPassportToken()).toBeNull();
  });

  test('keeps concurrent request credentials isolated', async () => {
    const context = new AsyncLocalStorage<{
      headers: Record<string, string>;
    }>();
    Object.defineProperty(globalThis, symbol, {
      configurable: true,
      value: { get: () => context.getStore() },
    });
    await Promise.all(
      ['first-token', 'second-token', undefined].map(token =>
        context.run(
          { headers: token ? { [PASSPORT_HEADER_NAME]: token } : {} },
          async () => {
            await new Promise(resolve => setImmediate(resolve));
            expect(getPassportToken()).toBe(token ?? null);
          }
        )
      )
    );
    expect(getPassportToken()).toBeNull();
  });
});

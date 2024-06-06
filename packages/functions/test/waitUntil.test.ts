import { expect, test, vi } from 'vitest';

import { waitUntil } from '../src';

test.each([
  {},
  () => {},
  function () {},
  NaN,
  1,
  false,
  undefined,
  null,
  [],
  '▲',
])('waitUntil throws when called with %s', input => {
  expect(() => waitUntil(input as Promise<any>)).toThrow(TypeError);
  expect(() => waitUntil(input as Promise<any>)).toThrow(
    `waitUntil can only be called with a Promise, got ${typeof input}`
  );
});

test.each([null, undefined, {}])(
  'waitUntil does not throw an error when context is %s',
  input => {
    const promise = Promise.resolve();
    globalThis[
      // @ts-ignore
      Symbol.for(
        '@vercel/request-context'
      ) as unknown as keyof typeof globalThis
    ] = input;
    expect(() => waitUntil(promise)).not.toThrow();
  }
);

test('waitUntil calls ctx.waitUntil when available', async () => {
  const promise = Promise.resolve();
  const waitUntilMock = vi.fn().mockReturnValue(promise);
  globalThis[
    // @ts-ignore
    Symbol.for('@vercel/request-context') as unknown as keyof typeof globalThis
  ] = {
    get: () => ({ waitUntil: waitUntilMock }),
  };
  waitUntil(promise);
  expect(waitUntilMock).toHaveBeenCalledWith(promise);
});

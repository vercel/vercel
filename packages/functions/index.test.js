/* global globalThis */

import { vi, expect, test } from 'vitest';

import { waitUntil } from '.';

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
  expect(() => waitUntil(input)).toThrow(TypeError);
  expect(() => waitUntil(input)).toThrow(
    `waitUntil can only be called with a Promise, got ${typeof input}`
  );
});

test.each([null, undefined, {}])(
  'waitUntil throws when context is %s',
  input => {
    const promise = Promise.resolve();
    globalThis[Symbol.for('@vercel/request-context')] = input;
    expect(() => waitUntil(promise)).toThrow(Error);
    expect(() => waitUntil(promise)).toThrow(
      'failed to get waitUntil function for this request context'
    );
  }
);

test('waitUntil calls ctx.waitUntil when available', async () => {
  const promise = Promise.resolve();
  const waitUntilMock = vi.fn().mockReturnValue(promise);
  globalThis[Symbol.for('@vercel/request-context')] = {
    get: () => ({ waitUntil: waitUntilMock }),
  };
  waitUntil(promise);
  expect(waitUntilMock).toHaveBeenCalledWith(promise);
});

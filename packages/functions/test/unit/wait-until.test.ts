import { expect, test, vi } from 'vitest';

import { waitUntil } from '../../src/wait-until';
import { SYMBOL_FOR_REQ_CONTEXT } from '../../src/get-context';

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
    globalThis[SYMBOL_FOR_REQ_CONTEXT] = input;
    expect(() => waitUntil(promise)).not.toThrow();
  }
);

test('waitUntil calls ctx.waitUntil when available', async () => {
  const promise = Promise.resolve();
  const waitUntilMock = vi.fn().mockReturnValue(promise);
  globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
    get: () => ({ waitUntil: waitUntilMock }),
  };
  waitUntil(promise);
  expect(waitUntilMock).toHaveBeenCalledWith(promise);
});

/* global globalThis */

export const waitUntil = promise => {
  if (
    promise instanceof Promise === false ||
    promise === null ||
    typeof promise !== 'object' ||
    typeof promise.then !== 'function'
  ) {
    throw new TypeError(
      `waitUntil can only be called with a Promise, got ${typeof promise}`
    );
  }

  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.() ?? {};

  if (!ctx.waitUntil) {
    throw new Error(
      'failed to get waitUntil function for this request context'
    );
  }

  ctx.waitUntil(promise);
};

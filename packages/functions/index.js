/* global globalThis */

exports.waitUntil = promise => {
  if (
    promise === null ||
    typeof promise !== 'object' ||
    typeof promise.then !== 'function'
  ) {
    throw new TypeError(
      `waitUntil can only be called with a Promise, got ${typeof promise}`
    );
  }

  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.() ?? {};
  ctx.waitUntil?.(promise);
};

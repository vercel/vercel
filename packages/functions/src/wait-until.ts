type Context = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

export const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

/**
 * Extends the lifetime of the request handler for the lifetime of the given {@link Promise}
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil
 *
 * @param promise The promise to wait for.
 * @example
 *
 * ```
 * import { waitUntil } from '@vercel/functions';
 *
 * export function GET(request) {
 *   waitUntil(fetch('https://vercel.com'));
 *   return new Response('OK');
 * }
 * ```
 */
export const waitUntil = (promise: Promise<unknown>) => {
  if (
    promise === null ||
    typeof promise !== 'object' ||
    typeof promise.then !== 'function'
  ) {
    throw new TypeError(
      `waitUntil can only be called with a Promise, got ${typeof promise}`
    );
  }

  return getContext().waitUntil?.(promise);
};

function getContext(): Context {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

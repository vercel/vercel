import { RuntimeCache } from './cache/types';
import { PurgeApi } from './purge/types';
import { AddCacheTagApi } from './addcachetag/types';

type Context = {
  waitUntil?: (promise: Promise<unknown>) => void;
  cache?: RuntimeCache;
  purge?: PurgeApi;
  addCacheTag?: AddCacheTagApi;
  headers?: Record<string, string>;
  /**
   * Low-level WebSocket upgrade provided by the runtime bridge.
   * Writes a 101 response on the underlying socket and returns the
   * raw duplex stream. The `@vercel/functions` `upgradeWebSocket()`
   * wraps this into a higher-level API.
   */
  upgradeWebSocket?: () => unknown;
};

export const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

export function getContext(): Context {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

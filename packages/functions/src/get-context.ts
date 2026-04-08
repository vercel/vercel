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
   * Writes a 101 response on the underlying socket, detaches it
   * from the ServerResponse, and returns the raw req/socket/head
   * tuple for use with libraries like `ws`.
   */
  upgradeWebSocket?: () => {
    req: unknown;
    socket: unknown;
    head: unknown;
  };
};

export const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

export function getContext(): Context {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

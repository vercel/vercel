import { RuntimeCache } from './cache/types';
import { PurgeApi } from './purge/types';

type Context = {
  waitUntil?: (promise: Promise<unknown>) => void;
  cache?: RuntimeCache;
  purge?: PurgeApi;
  headers?: Record<string, string>;
};

export const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

export function getContext(): Context {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

// duplicated from @vercel/functions. can we re-use it?

type Context = {
  waitUntil?: (promise: Promise<unknown>) => void;
  headers?: Record<string, string>;
};

export const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

export function getContext(): Context {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

type RequestContext = {
  headers?: Record<string, string | undefined>;
};

export function getContext(): RequestContext {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => RequestContext | undefined };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

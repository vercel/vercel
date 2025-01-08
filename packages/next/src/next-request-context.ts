/*
WARNING: WATCH OUT IF YOU'RE MODIFYING THIS FILE!
The types here must be kept in sync (or at least backwards-compatible)
with "@next/request-context" in the Next.js codebase.

This module defines `globalThis[Symbol.for("@next/request-context")]`
which Next.js uses to access `waitUntil`.
It is expected that the platform provides this.
*/

import { AsyncLocalStorage } from 'async_hooks';

const name = '@next/request-context';
export const NEXT_REQUEST_CONTEXT_SYMBOL = Symbol.for(name);

const INTERNAL_STORAGE_FIELD_SYMBOL = Symbol.for('internal.storage');

export type NextRequestContextValue = {
  waitUntil?: WaitUntil;
};

export type NextRequestContext = {
  get(): NextRequestContextValue | undefined;
  /** @ignore */
  [INTERNAL_STORAGE_FIELD_SYMBOL]: AsyncLocalStorage<NextRequestContextValue>;
};

export type WaitUntil = (promise: Promise<any>) => void;

/** Next.js will read this context off of `globalThis[Symbol.for("@next-request-context")]`,
 * So it's important that it's only ever created (and installed) once, regardless of any
 * bundling shenanigans
 */
function getOrCreateContextSingleton(): NextRequestContext {
  const _globalThis = globalThis as typeof globalThis & {
    [NEXT_REQUEST_CONTEXT_SYMBOL]?: NextRequestContext;
  };

  // make sure we only define the context once.
  if (!_globalThis[NEXT_REQUEST_CONTEXT_SYMBOL]) {
    const storage = new AsyncLocalStorage<NextRequestContextValue>();
    const Context: NextRequestContext = {
      get: () => storage.getStore(),
      [INTERNAL_STORAGE_FIELD_SYMBOL]: storage,
    };
    _globalThis[NEXT_REQUEST_CONTEXT_SYMBOL] = Context;
  }

  return _globalThis[NEXT_REQUEST_CONTEXT_SYMBOL];
}

export const NextRequestContext = getOrCreateContextSingleton();

export function withNextRequestContext<T>(
  value: NextRequestContextValue,
  callback: () => T
): T {
  const storage = NextRequestContext[INTERNAL_STORAGE_FIELD_SYMBOL];
  return storage.run(value, callback);
}

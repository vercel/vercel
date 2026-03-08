import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import type { Dispatcher } from 'undici';

export type FetchDispatcher = Dispatcher & {
  close?: () => Promise<void>;
  destroy?: (reason?: Error) => Promise<void>;
};

export type FetchBody = BodyInit | NodeJS.ReadableStream | null | undefined;
const GLOBAL_DISPATCHER_SYMBOL = Symbol.for('undici.globalDispatcher.1');

export function isNodeReadableStream(
  body: FetchBody
): body is NodeJS.ReadableStream {
  return (
    typeof body === 'object' &&
    body !== null &&
    'pipe' in body &&
    typeof body.pipe === 'function'
  );
}

export function withNodeFetchCompat<T extends { body?: FetchBody }>(
  init: T & { dispatcher?: FetchDispatcher; duplex?: 'half' }
): RequestInit & { dispatcher?: FetchDispatcher; duplex?: 'half' } {
  if (isNodeReadableStream(init.body) && init.duplex !== 'half') {
    return {
      ...init,
      duplex: 'half' as const,
    } as RequestInit & { dispatcher?: FetchDispatcher; duplex?: 'half' };
  }

  return init as RequestInit & {
    dispatcher?: FetchDispatcher;
    duplex?: 'half';
  };
}

export function toNodeReadableStream(
  body: ReadableStream<Uint8Array> | null | undefined
) {
  if (!body) {
    return null;
  }

  return Readable.fromWeb(body as NodeWebReadableStream);
}

export async function fetchWithNodeCompat(
  input: Request | URL | string,
  init: {
    body?: FetchBody;
    dispatcher?: FetchDispatcher;
    duplex?: 'half';
  } & Omit<RequestInit, 'body'>
) {
  const { dispatcher, ...requestInit } = withNodeFetchCompat(init);
  if (!dispatcher) {
    return fetch(input, requestInit);
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_DISPATCHER_SYMBOL]?: FetchDispatcher;
  };
  const previousDispatcher = globalScope[GLOBAL_DISPATCHER_SYMBOL];
  globalScope[GLOBAL_DISPATCHER_SYMBOL] = dispatcher;

  try {
    return await fetch(input, requestInit);
  } finally {
    if (previousDispatcher) {
      globalScope[GLOBAL_DISPATCHER_SYMBOL] = previousDispatcher;
    } else {
      delete globalScope[GLOBAL_DISPATCHER_SYMBOL];
    }
  }
}

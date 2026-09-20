import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { fetch as undiciFetch, type Dispatcher } from 'undici';

type NativeRequestInit = NonNullable<Parameters<typeof globalThis.fetch>[1]>;
type NativeResponse = InstanceType<typeof globalThis.Response>;
type NativeResponseInit = NonNullable<
  ConstructorParameters<typeof globalThis.Response>[1]
>;

export type FetchDispatcher = Pick<Dispatcher, 'dispatch'>;

export type BodyInit =
  | NonNullable<NativeRequestInit['body']>
  | Buffer
  | NodeJS.ReadableStream;
export type HeadersInit = NonNullable<
  ConstructorParameters<typeof globalThis.Headers>[0]
>;
export type RequestInfo = Parameters<typeof globalThis.fetch>[0];
export interface RequestInit
  extends Omit<NativeRequestInit, 'body' | 'dispatcher'> {
  body?: BodyInit | null;
  dispatcher?: FetchDispatcher;
}
export type Headers = InstanceType<typeof globalThis.Headers>;
export type Request = InstanceType<typeof globalThis.Request>;
export interface Response extends Omit<NativeResponse, 'json'> {
  json(): Promise<any>;
}

export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response as unknown as {
  new (body?: BodyInit | null, init?: NativeResponseInit): Response;
  error(): Response;
  json(data: unknown, init?: NativeResponseInit): Response;
  redirect(url: string | URL, status?: number): Response;
  readonly prototype: Response;
};

let fetchDispatcher: FetchDispatcher | undefined;

export function setFetchDispatcher(
  dispatcher: FetchDispatcher | undefined
): void {
  fetchDispatcher = dispatcher;
}

/**
 * The proxy-aware dispatcher applied to CLI requests, if one was configured.
 * Pass it to libraries that make their own `fetch` calls (e.g.
 * `@vercel/client`) so they respect `HTTP_PROXY`/`HTTPS_PROXY` too.
 */
export function getFetchDispatcher(): FetchDispatcher | undefined {
  return fetchDispatcher;
}

export default function fetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const options = { ...init } as RequestInit & {
    dispatcher?: FetchDispatcher;
    duplex?: 'half';
  };

  if (fetchDispatcher) {
    options.dispatcher = fetchDispatcher;
  }

  if (init?.body instanceof Readable) {
    options.duplex = 'half';
  }

  if (fetchDispatcher) {
    // A custom dispatcher is configured (e.g. `EnvProxyDispatcher`, used for
    // `HTTP_PROXY`/`HTTPS_PROXY` support). Issue the request through the
    // CLI's *bundled* `undici` package's own `fetch()` instead of the
    // runtime's native `globalThis.fetch`.
    //
    // Node's native fetch is backed by whichever `undici` major version
    // ships internally with that Node release, and the shape of the
    // dispatcher/handler objects it passes around is not a stable,
    // cross-version public API. Handing it a dispatcher built from a
    // *different* undici major than the one powering `globalThis.fetch` can
    // throw (e.g. Node 26 embeds undici 8, which removed the legacy handler
    // wrappers that undici 5 -- the version the CLI bundles -- relies on,
    // causing `TypeError: fetch failed` / `UND_ERR_INVALID_ARG`). Using the
    // bundled undici's own `fetch` guarantees the dispatcher and the fetch
    // implementation always agree on the handler shape, regardless of the
    // Node version the CLI runs on. See vercel/vercel#17629.
    return undiciFetch(
      input as any,
      options as any
    ) as unknown as Promise<Response>;
  }

  return globalThis.fetch(
    input,
    options as unknown as NativeRequestInit
  ) as Promise<Response>;
}

/**
 * Like {@link fetch}, but never applies the global proxy-aware dispatcher.
 *
 * This is required for internal loopback requests made by `vercel dev` (e.g.
 * dispatching to the local middleware/queue worker on `127.0.0.1`). Those
 * requests must always go directly to the loopback dev server and must never
 * be routed through an `HTTP_PROXY`/`HTTPS_PROXY` configured via env vars,
 * which would otherwise break local dev for users behind a corporate proxy
 * that does not list `127.0.0.1`/`localhost` in `no_proxy`.
 */
export function directFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const options = { ...init } as RequestInit & {
    dispatcher?: FetchDispatcher;
    duplex?: 'half';
  };

  // Ensure no dispatcher (proxy or otherwise) is applied.
  delete options.dispatcher;

  if (init?.body instanceof Readable) {
    options.duplex = 'half';
  }

  return globalThis.fetch(
    input,
    options as unknown as NativeRequestInit
  ) as Promise<Response>;
}

export function toNodeReadable(body: Response['body']): Readable {
  if (!body) {
    throw new TypeError('Expected response body');
  }

  return Readable.fromWeb(body as unknown as ReadableStream<Uint8Array>);
}

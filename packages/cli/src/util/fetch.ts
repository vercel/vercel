import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { Dispatcher } from 'undici';

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

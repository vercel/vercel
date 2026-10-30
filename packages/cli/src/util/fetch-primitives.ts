import type { BodyInit, Response as FetchResponse } from './fetch';
export type Response = FetchResponse;
type NativeResponseInit = NonNullable<
  ConstructorParameters<typeof globalThis.Response>[1]
>;
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response as unknown as {
  new (body?: BodyInit | null, init?: NativeResponseInit): Response;
  error(): Response;
  json(data: unknown, init?: NativeResponseInit): Response;
  redirect(url: string | URL, status?: number): Response;
  readonly prototype: Response;
};

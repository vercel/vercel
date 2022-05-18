import { CallContext, CallHandle } from './call';
export * from './call';
export declare type FetchOptions = globalThis.RequestInit & CallContext;
export declare function createFetch(call: CallHandle, _fetch?: typeof fetch): (input: string | Request, init: FetchOptions) => Promise<Response>;

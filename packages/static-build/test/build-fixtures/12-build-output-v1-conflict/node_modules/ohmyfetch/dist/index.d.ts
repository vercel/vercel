import { $ as $Fetch } from './error-d4c70d05.js';
export { $ as $Fetch, C as CreateFetchOptions, b as FetchContext, e as FetchError, c as FetchOptions, F as FetchRequest, a as FetchResponse, S as SearchParams, d as createFetch, f as createFetchError } from './error-d4c70d05.js';

declare const fetch: typeof globalThis.fetch;
declare const Headers: {
    new (init?: HeadersInit | undefined): Headers;
    prototype: Headers;
};
declare const $fetch: $Fetch;

export { $fetch, Headers, fetch };

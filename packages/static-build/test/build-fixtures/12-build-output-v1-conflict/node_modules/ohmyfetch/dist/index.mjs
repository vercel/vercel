import { c as createFetch } from './chunks/fetch.mjs';
export { F as FetchError, c as createFetch, a as createFetchError } from './chunks/fetch.mjs';
import 'destr';
import 'ufo';

const _globalThis = function() {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  if (typeof self !== "undefined") {
    return self;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof global !== "undefined") {
    return global;
  }
  throw new Error("unable to locate global object");
}();
const fetch = _globalThis.fetch || (() => Promise.reject(new Error("[ohmyfetch] global.fetch is not supported!")));
const Headers = _globalThis.Headers;
const $fetch = createFetch({ fetch, Headers });

export { $fetch, Headers, fetch };

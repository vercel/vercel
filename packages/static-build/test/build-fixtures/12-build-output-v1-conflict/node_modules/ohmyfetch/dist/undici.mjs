import { fetch as fetch$1 } from 'undici';
import { createNodeFetch, Headers } from './node.mjs';
export { Headers } from './node.mjs';
import { c as createFetch } from './chunks/fetch.mjs';
export { F as FetchError, c as createFetch, a as createFetchError } from './chunks/fetch.mjs';
import 'http';
import 'https';
import 'node-fetch-native';
import 'destr';
import 'ufo';

const fetch = globalThis.fetch || fetch$1 || createNodeFetch();
const $fetch = createFetch({ fetch, Headers });

export { $fetch, fetch };

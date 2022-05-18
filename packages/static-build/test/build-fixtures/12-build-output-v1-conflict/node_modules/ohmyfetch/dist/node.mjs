import http from 'http';
import https from 'https';
import nodeFetch, { Headers as Headers$1 } from 'node-fetch-native';
import { c as createFetch } from './chunks/fetch.mjs';
export { F as FetchError, c as createFetch, a as createFetchError } from './chunks/fetch.mjs';
import 'destr';
import 'ufo';

function createNodeFetch() {
  const useKeepAlive = JSON.parse(process.env.FETCH_KEEP_ALIVE || "false");
  if (!useKeepAlive) {
    return nodeFetch;
  }
  const agentOpts = { keepAlive: true };
  const httpAgent = new http.Agent(agentOpts);
  const httpsAgent = new https.Agent(agentOpts);
  const nodeFetchOptions = {
    agent(parsedURL) {
      return parsedURL.protocol === "http:" ? httpAgent : httpsAgent;
    }
  };
  return function nodeFetchWithKeepAlive(input, init) {
    return nodeFetch(input, { ...nodeFetchOptions, ...init });
  };
}
const fetch = globalThis.fetch || createNodeFetch();
const Headers = globalThis.Headers || Headers$1;
const $fetch = createFetch({ fetch, Headers });

export { $fetch, Headers, createNodeFetch, fetch };

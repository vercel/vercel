import fetch, { Body, Response, RequestInit } from 'node-fetch';

// Packages
import { parse } from 'url';
import Sema from 'async-sema';
import createOutput, { Output } from './output/create-output';

const context = () => {
  return {
    fetch,
  };
};

type CurrentContext = ReturnType<typeof context> & {
  fetchesMade: number;
  ongoingFetches: number;
};

export interface AgentFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: NodeJS.ReadableStream | string;
  headers: { [key: string]: string };
}

/**
 * Returns a `fetch` version with a similar API to the browser's configured with a
 * HTTP2 agent. It encodes `body` automatically as JSON.
 *
 * @param {String} host
 * @return {Function} fetch
 */
export default class NowAgent {
  _contexts: ReturnType<typeof context>[];
  _currContext: CurrentContext;
  _output: Output;
  _protocol?: string;
  _sema: Sema;
  _url: string;

  constructor(url: string, { debug = false } = {}) {
    this._contexts = [context()];
    this._currContext = {
      ...this._contexts[0],
      fetchesMade: 0,
      ongoingFetches: 0,
    };

    const parsed = parse(url);
    this._url = url;
    this._protocol = parsed.protocol;
    this._sema = new Sema(20);
    this._output = createOutput({ debug });
  }

  setConcurrency({
    maxStreams,
    capacity,
  }: {
    maxStreams: number;
    capacity: number;
  }) {
    this._sema = new Sema(maxStreams || 20, { capacity });
  }

  async fetch(path: string, opts: AgentFetchOptions) {
    const { debug } = this._output;
    await this._sema.acquire();
    let currentContext: CurrentContext;
    this._currContext.fetchesMade++;

    // If we're changing contexts, we don't want to record the ongoingFetch on the old context
    // That'll cause an off-by-one error when trying to close the old socket later
    this._currContext.ongoingFetches++;
    currentContext = this._currContext;

    debug(`Total requests made: ${this._currContext.fetchesMade}`);
    debug(`Concurrent requests: ${this._currContext.ongoingFetches}`);

    let body: Body | string | undefined;
    if (opts.body && typeof opts.body === 'object') {
      if (typeof (<NodeJS.ReadableStream>opts.body).pipe === 'function') {
        body = new Body(<NodeJS.ReadableStream>opts.body);
      } else {
        opts.headers['Content-Type'] = 'application/json';
        body = new Body(opts.body);
      }
    } else {
      body = opts.body;
    }

    const { host } = parse(path);
    const handleCompleted = async <T>(res: T) => {
      currentContext.ongoingFetches--;

      this._sema.release();
      return res;
    };

    return currentContext
      .fetch((host ? '' : this._url) + path, { ...opts, body } as RequestInit)
      .then((res: Response) => handleCompleted(res))
      .catch((err: Error) => {
        handleCompleted(null);
        throw err;
      });
  }

  // @TODO: Remove the uses of this across codebase
  close() {}
}

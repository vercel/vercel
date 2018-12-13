import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { JsonBody, StreamBody, context } from 'fetch-h2';
import { parse } from 'url';
import Sema from 'async-sema';
import createOutput, { Output } from './output/create-output';

const MAX_REQUESTS_PER_CONNECTION = 1000;

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
  _agent: HttpAgent | HttpsAgent | null = null;
  _contexts: ReturnType<typeof context>[];
  _currContext: CurrentContext;
  _output: Output;
  _protocol?: string;
  _sema: Sema;
  _url: string;

  constructor(url: string, { tls = true, debug = false } = {}) {
    // We use multiple contexts because each context represent one connection
    // With nginx, we're limited to 1000 requests before a connection is closed
    // http://nginx.org/en/docs/http/ngx_http_v2_module.html#http2_max_requests
    // To get arround this, we keep track of requests made on a connection. when we're about to hit 1000
    // we start up a new connection, and re-route all future traffic through the new connection
    // and when the final request from the old connection resolves, we auto-close the old connection
    this._contexts = [context()];
    this._currContext = {
      ...this._contexts[0],
      fetchesMade: 0,
      ongoingFetches: 0
    };

    const parsed = parse(url);
    this._url = url;
    this._protocol = parsed.protocol;
    this._sema = new Sema(20);
    this._output = createOutput({ debug });
    if (tls) {
      this._initAgent();
    }
  }

  _initAgent() {
    const _Agent = this._protocol === 'https:' ? HttpsAgent : HttpAgent;
    this._agent = new _Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 8
    });

    // We are ignoring this error because agent implements an EventEmitter
    // but it doesn't appear in hte definition
    // @ts-ignore
    this._agent.on('error', error => this._onError(error, this._agent));
  }

  _onError(error: Error, agent: HttpAgent | HttpsAgent) {
    const { debug } = this._output;
    debug(`Agent connection error ${error}\n${error.stack}`);
    if (this._agent === agent) {
      this._agent = null;
    }
  }

  setConcurrency({
    maxStreams,
    capacity
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
    if (this._currContext.fetchesMade >= MAX_REQUESTS_PER_CONNECTION) {
      const ctx = { ...context(), fetchesMade: 1, ongoingFetches: 0 };
      this._contexts.push(ctx);
      this._currContext = ctx;
    }

    // If we're changing contexts, we don't want to record the ongoingFetch on the old context
    // That'll cause an off-by-one error when trying to close the old socket later
    this._currContext.ongoingFetches++;
    currentContext = this._currContext;

    debug(
      `Total requests made on socket #${this._contexts.length}: ${this
        ._currContext.fetchesMade}`
    );
    debug(
      `Concurrent requests on socket #${this._contexts.length}: ${this
        ._currContext.ongoingFetches}`
    );

    if (!this._agent) {
      debug('Re-initializing agent');
      this._initAgent();
    }

    let body: JsonBody | StreamBody | string | undefined;
    if (opts.body && typeof opts.body === 'object') {
      if (typeof (<NodeJS.ReadableStream>opts.body).pipe === 'function') {
        body = new StreamBody(<NodeJS.ReadableStream>opts.body);
      } else {
        opts.headers['Content-Type'] = 'application/json';
        body = new JsonBody(opts.body);
      }
    } else {
      body = opts.body;
    }

    const handleCompleted = async <T>(res: T) => {
      currentContext.ongoingFetches--;
      if (
        currentContext !== this._currContext &&
        currentContext.ongoingFetches <= 0
      ) {
        // We've completely moved on to a new socket
        // close the old one

        // TODO: Fix race condition:
        // If the response is a stream, and the server is still streaming data
        // we should check if the stream has closed before disconnecting
        // hasCompleted CAN technically be called before the res body stream is closed
        debug('Closing old socket');
        currentContext.disconnect(this._url);
      }

      this._sema.release();
      return res;
    };

    // We have to set the `host` manually when using http2
    opts.headers.host = this._url.replace(/^https?:\/\//, '');
    return currentContext
      .fetch(this._url + path, { ...opts, body })
      .then(res => handleCompleted(res))
      .catch((err: Error) => {
        handleCompleted(null);
        throw err;
      });
  }

  close() {
    const { debug } = this._output;
    debug('Closing agent');

    if (this._agent) {
      this._agent.destroy();
    }

    this._currContext.disconnect(this._url);
  }
}

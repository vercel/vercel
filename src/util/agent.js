// Native
const { parse } = require('url');
const http = require('http');
const https = require('https');
const { JsonBody, StreamBody, context } = require('fetch-h2');

// Packages
const Sema = require('async-sema');
const createOutput = require('./output');

const MAX_REQUESTS_PER_CONNECTION = 1000;

/**
 * Returns a `fetch` version with a similar
 * API to the browser's configured with a
 * HTTP2 agent.
 *
 * It encodes `body` automatically as JSON.
 *
 * @param {String} host
 * @return {Function} fetch
 */

module.exports = class Agent {
  constructor(url, { tls = true, debug } = {}) {
    // We use multiple contexts because each context represent one connection
    // With nginx, we're limited to 1000 requests before a connection is closed
    // http://nginx.org/en/docs/http/ngx_http_v2_module.html#http2_max_requests
    // To get arround this, we keep track of requests made on a connection. when we're about to hit 1000
    // we start up a new connection, and re-route all future traffic through the new connection
    // and when the final request from the old connection resolves, we auto-close the old connection
    this._contexts = [context()];
    this._currContext = this._contexts[0];
    this._currContext.fetchesMade = 0;
    this._currContext.ongoingFetches = 0;

    this._url = url;
    const parsed = parse(url);
    this._protocol = parsed.protocol;
    this._sema = new Sema(20);
    this._output = createOutput({ debug });
    if (tls) {
      this._initAgent();
    }
  }

  _initAgent() {
    const module = this._protocol === 'https:' ? https : http;
    this._agent = new module.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 8
    }).on('error', err => this._onError(err, this._agent));
  }

  _onError(err, agent) {
    const { debug } = this._output;
    debug(`Agent connection error ${err}\n${err.stack}`);
    if (this._agent === agent) {
      this._agent = null;
    }
  }

  setConcurrency({ maxStreams, capacity }) {
    this._sema = new Sema(maxStreams || 20, { capacity });
  }

  async fetch(path, opts = {}) {
    const { debug } = this._output;
    await this._sema.v();

    let currentContext;

    this._currContext.fetchesMade++;
    if (this._currContext.fetchesMade >= MAX_REQUESTS_PER_CONNECTION) {
      const ctx = context();
      ctx.fetchesMade = 1;
      ctx.ongoingFetches = 0;
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

    const { body } = opts;
    if (this._agent) {
      opts.agent = this._agent;
    }

    if (body && typeof body === 'object' && typeof body.pipe !== 'function') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = new JsonBody(body);
    }

    if (
      body &&
      typeof body === 'object' &&
      typeof body.pipe === 'function'
    ) {
      opts.body = new StreamBody(body);
    }

    const handleCompleted = async res => {
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

      this._sema.p();
      return res;
    };

    // We have to set the `host` manually when using http2
    opts.headers.host = this._url.replace(/^https?:\/\//, '');
    return currentContext
      .fetch(this._url + path, opts)
      .then(res => handleCompleted(res) || res)
      .catch(err => {
        handleCompleted();
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
};

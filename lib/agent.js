import http2 from 'spdy';
import fetch from 'node-fetch';
import { parse } from 'url';

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

export default class Agent {
  constructor (url, { debug } = {}) {
    this._url = url;
    this._host = parse(url).host;
    this._debug = debug;
    this._initAgent();
  }

  _initAgent () {
    this._agent = http2.createAgent({
      host: this._host,
      port: 443
    }).once('error', (err) => this._onError(err));
  }

  _onError (err) {
    // XXX: should we `this.emit()`?
    if (this._debug) {
      console.log('> [debug] agent connection error', err.stack);
    }
    this._error = err;
  }

  fetch (path, opts = {}) {
    if (this._error) {
      if (this._debug) console.log('> [debug] re-initializing agent after error');
      this._error = null;
      this._initAgent();
    }

    const { body } = opts;
    opts.agent = this._agent;

    if (body && 'object' === typeof body && 'function' !== typeof body.pipe) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    if (null != opts.body && 'function' !== typeof body.pipe) {
      opts.headers['Content-Length'] = Buffer.byteLength(opts.body);
    }

    return fetch(this._url + path, opts);
  }

  close () {
    if (this._debug) console.log('> [debug] closing agent');
    return this._agent.close();
  }
}

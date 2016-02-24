import http2 from 'spdy';
import fetch from 'node-fetch';

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
  constructor (host) {
    this._host = host;
    this._agent = http2.createAgent({
      host,
      port: 443
    }).once('error', (err) => this._onError(err));
  }

  _onError (err) {
    // XXX: should we `this.emit()`?
    this._error = err;
  }

  fetch (path, opts = {}) {
    if (this._error) throw new Error('HTTP2 connection error');

    const { body } = opts;
    opts.agent = this._agent;

    if (body && 'object' === typeof body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    if (null != body) {
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    return fetch(`https://${this._host}${path}`, opts);
  }

  close () {
    return this._agent.close();
  }
}

// Native
const { parse } = require('url')
const http = require('http')
const https = require('https')

// Packages
const fetch = require('node-fetch')
const { fetch: fetchH2, JsonBody, StreamBody, disconnect } = require('fetch-h2')
const Sema = require('async-sema');

const USE_HTTP2 = true;

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
    this._url = url
    const parsed = parse(url)
    this._protocol = parsed.protocol
    this._sema = new Sema(20)
    this._debug = debug
    if (tls) {
      this._initAgent()
    }
  }

  _initAgent() {
    const module = this._protocol === 'https:' ? https : http
    this._agent = new module.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 8
    }).on('error', err => this._onError(err, this._agent))
  }

  _onError(err, agent) {
    if (this._debug) {
      console.log(`> [debug] agent connection error ${err}\n${err.stack}`)
    }
    if (this._agent === agent) {
      this._agent = null
    }
  }

  setConcurrency({maxStreams, capacity}) {
    this._sema = new Sema(maxStreams || 20, {capacity})
  }

  async fetch(path, opts = {}) {
    await this._sema.v()
    // console.log(path, this._sema.nrWaiting())

    if (!this._agent) {
      if (this._debug) {
        console.log('> [debug] re-initializing agent')
      }
      this._initAgent()
    }

    const { body } = opts
    if (this._agent) {
      opts.agent = this._agent
    }

    if (body && typeof body === 'object' && typeof body.pipe !== 'function') {
      opts.headers['Content-Type'] = 'application/json'
      if (USE_HTTP2) {
        opts.body = new JsonBody(body)
      } else {
        opts.body = JSON.stringify(body)
      }
    }

    if(USE_HTTP2 && body && typeof body === 'object' && typeof body.pipe === 'function') {
      opts.body = new StreamBody(body)
    }

    if (!USE_HTTP2 && opts.body && typeof body.pipe !== 'function') {
      opts.headers['Content-Length'] = Buffer.byteLength(opts.body)
    }

    if (USE_HTTP2) {
      return fetchH2(this._url + path, opts).then(res => this._sema.p() || res)
    } else {
      return fetch(this._url + path, opts)
    }
  }

  close() {
    if (this._debug) {
      console.log('> [debug] closing agent')
    }

    if (this._agent) {
      this._agent.destroy()
    }
    if (USE_HTTP2) {
      disconnect(this._url)
    }
  }
}

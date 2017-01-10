// Packages
const {parse} = require('url')
const http2 = require('spdy')
const fetch = require('node-fetch')

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
  constructor(url, {tls = true, debug} = {}) {
    this._url = url
    const parsed = parse(url)
    this._host = parsed.hostname
    this._port = parsed.port
    this._protocol = parsed.protocol
    this._debug = debug
    if (tls) {
      this._initAgent()
    }
  }

  _initAgent() {
    if (this._protocol !== 'https:') {
      return
    }

    this._agent = http2.createAgent({
      host: this._host,
      port: this._port || 443
    }).once('error', err => this._onError(err))
  }

  _onError(err) {
    if (this._debug) {
      console.log('> [debug] agent connection error', err.stack)
    }
    this._error = err
  }

  fetch(path, opts = {}) {
    if (this._error) {
      if (this._debug) {
        console.log('> [debug] re-initializing agent after error')
      }

      this._error = null
      this._initAgent()
    }

    const {body} = opts
    if (this._agent) {
      opts.agent = this._agent
    }

    if (body && typeof body === 'object' && typeof body.pipe !== 'function') {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }

    if (opts.body && typeof body.pipe !== 'function') {
      opts.headers['Content-Length'] = Buffer.byteLength(opts.body)
    }

    return fetch(this._url + path, opts)
  }

  close() {
    if (this._debug) {
      console.log('> [debug] closing agent')
    }

    if (this._agent) {
      this._agent.close()
    }
  }
}

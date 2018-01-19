// Native
const { parse } = require('url')
const http = require('http')
const https = require('https')

// Packages
const fetch = require('node-fetch')
const {version} = require('../../../util/pkg')
const Sema = require('async-sema')

// TODO: Don't limit to canary
const USE_HTTP2 = version.indexOf('canary') > -1
const MAX_REQUESTS_PER_CONNECTION = 1000

let JsonBody, StreamBody, context

if (USE_HTTP2) {
  ({ JsonBody, StreamBody, context } = require('fetch-h2'))

  // this requires `--no-warnings` to be passed to node.js to work
  process.on('warning', function (warn) {
    if (warn.message.includes('http2')) {
      // ignore warnings about http2, we know node!
    } else {
      console.warn(warn.message);
    }
  });
}

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
    if (USE_HTTP2) {
      // We use multiple contexts because each context represent one connection
      // With nginx, we're limited to 1000 requests before a connection is closed
      // http://nginx.org/en/docs/http/ngx_http_v2_module.html#http2_max_requests
      // To get arround this, we keep track of requests made on a connection. when we're about to hit 1000
      // we start up a new connection, and re-route all future traffic through the new connection
      // and when the final request from the old connection resolves, we auto-close the old connection
      this._contexts = [context()]
      this._currContext = this._contexts[0]
      this._currContext.fetchesMade = 0
      this._currContext.ongoingFetches = 0
    }

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

    let currentContext;

    if (USE_HTTP2) {
      this._currContext.fetchesMade++;
      if(this._currContext.fetchesMade >= MAX_REQUESTS_PER_CONNECTION) {
        const ctx = context()
        ctx.fetchesMade = 1
        ctx.ongoingFetches = 0
        this._contexts.push(ctx)
        this._currContext = ctx
      }

      // If we're changing contexts, we don't want to record the ongoingFetch on the old context
      // That'll cause an off-by-one error when trying to close the old socket later
      this._currContext.ongoingFetches++;
      currentContext = this._currContext

      if (this._debug) {
        console.log('> [debug] Total requests made on socket #%d: %d', this._contexts.length, this._currContext.fetchesMade)
        console.log('> [debug] Concurrent requests on socket #%d: %d', this._contexts.length, this._currContext.ongoingFetches)
      }
    }

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

    const handleCompleted = async (res) => {
      if (USE_HTTP2) {
        currentContext.ongoingFetches--;
        if(currentContext !== this._currContext && currentContext.ongoingFetches <= 0) {
          // We've completely moved on to a new socket
          // close the old one

          // TODO: Fix race condition:
          // If the response is a stream, and the server is still streaming data
          // we should check if the stream has closed before disconnecting
          // hasCompleted CAN technically be called before the res body stream is closed
          if (this._debug) {
            console.log('> [debug] Closing old socket');
          }
          currentContext.disconnect(this._url)
        }
      }
      this._sema.p()
      return res
    }

    if (USE_HTTP2) {
      // We have to set the `host` manually when using http2
      opts.headers.host = this._url.replace(/^https?:\/\//, '')
      return currentContext.fetch(this._url + path, opts)
        .then(res => handleCompleted(res) || res)
        .catch(err => {
          handleCompleted()
          throw err
        })
    } else {
      return fetch(this._url + path, opts)
        .then(res => this._sema.p() || res)
        .catch(err => {
          this._sema.p()
          throw err
        })
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
      this._currContext.disconnect(this._url)
    }
  }
}

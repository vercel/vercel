const { URL } = require('url');
const { request } = require('http');
const { Socket } = require('net');
const { createCipheriv } = require('crypto');
const { pipeline, Transform } = require('stream');

const CRLF = `\r\n`;

/**
 * If the `http.Server` handler function throws an error asynchronously,
 * then it ends up being an unhandled rejection which doesn't kill the node
 * process which causes the HTTP request to hang indefinitely. So print the
 * error here and force the process to exit so that the lambda invocation
 * returns an Unhandled error quickly.
 */
process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

/**
 * @param {import('./types').VercelProxyEvent} event
 */
function normalizeProxyEvent(event) {
  let bodyBuffer;
  /**
   * @type {import('./types').VercelProxyRequest}
   */
  const payload = JSON.parse(event.body);
  const {
    method,
    path,
    headers,
    encoding,
    body,
    payloads,
    responseCallbackCipher,
    responseCallbackCipherIV,
    responseCallbackCipherKey,
    responseCallbackStream,
    responseCallbackUrl,
    features,
  } = payload;

  /**
   *
   * @param {string | Buffer} body
   * @returns Buffer
   */
  const normalizeBody = body => {
    if (body) {
      if (typeof body === 'string' && encoding === 'base64') {
        bodyBuffer = Buffer.from(body, encoding);
      } else if (encoding === undefined) {
        bodyBuffer = Buffer.from(body);
      } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
      }
    } else {
      bodyBuffer = Buffer.alloc(0);
    }
    return bodyBuffer;
  };

  if (payloads) {
    for (const targetPayload of payloads) {
      targetPayload.features = features;
      targetPayload.body = normalizeBody(payload.body);
    }
  }
  bodyBuffer = normalizeBody(body);

  return {
    isApiGateway: false,
    method,
    path,
    headers,
    body: bodyBuffer,
    payloads,
    features,
    responseCallbackCipher,
    responseCallbackCipherIV,
    responseCallbackCipherKey,
    responseCallbackStream,
    responseCallbackUrl,
  };
}

/**
 * @param {import('./types').VercelProxyEvent } event
 * @return {import('./types').VercelProxyRequest }
 */
function normalizeEvent(event) {
  if (event.Action === 'Invoke') return normalizeProxyEvent(event);
  throw new Error(`Unexpected event.Action: ${event.Action}`);
}

class Bridge {
  /**
   * @param {import('./types').ServerLike | null} server
   * @param {boolean} shouldStoreEvents
   */
  constructor(server = null, shouldStoreEvents = false) {
    this.server = server;
    this.shouldStoreEvents = shouldStoreEvents;
    this.launcher = this.launcher.bind(this);
    this.reqIdSeed = 1;
    /**
     * @type {{ [key: string]: import('./types').VercelProxyRequest }}
     */
    this.events = {};

    this.listening = new Promise(resolve => {
      this.resolveListening = resolve;
    });
  }

  /**
   * @param {import('./types').ServerLike} server
   */
  setServer(server) {
    this.server = server;
  }

  /**
   * @param {boolean} shouldStoreEvents
   */
  setStoreEvents(shouldStoreEvents) {
    this.shouldStoreEvents = shouldStoreEvents;
  }

  listen() {
    const { server, resolveListening } = this;
    if (!server) {
      throw new Error('Server has not been set!');
    }

    if (typeof server.timeout === 'number' && server.timeout > 0) {
      // Disable timeout (usually 2 minutes until Node 13).
      // Instead, user should assign function `maxDuration`.
      server.timeout = 0;
    }

    return server.listen(
      {
        host: '127.0.0.1',
        port: 0,
      },
      function listeningCallback() {
        if (!this || typeof this.address !== 'function') {
          throw new Error(
            'Missing server.address() function on `this` in server.listen()'
          );
        }

        const addr = this.address();

        if (!addr) {
          throw new Error('`server.address()` returned `null`');
        }

        if (typeof addr === 'string') {
          throw new Error(
            `Unexpected string for \`server.address()\`: ${addr}`
          );
        }

        resolveListening(addr);
      }
    );
  }

  /**
   *
   * @param {import('./types').VercelProxyEvent} event
   * @param {import('aws-lambda').Context} context
   * @return {Promise<import('./types').VercelProxyResponse>}
   */
  async launcher(event, context) {
    context.callbackWaitsForEmptyEventLoop = false;
    const normalizedEvent = normalizeEvent(event);

    if (
      'payloads' in normalizedEvent &&
      Array.isArray(normalizedEvent.payloads)
    ) {
      let statusCode = 200;
      /**
       * @type {import('http').IncomingHttpHeaders}
       */
      let headers = {};
      /**
       * @type {string}
       */
      let combinedBody = '';
      const multipartBoundary = 'payload-separator';
      const CLRF = '\r\n';
      /**
       * @type {Record<string, any>[]}
       */
      const separateHeaders = [];
      /**
       * @type {Set<string>}
       */
      const allHeaderKeys = new Set();

      // we execute the payloads one at a time to ensure
      // lambda semantics
      for (let i = 0; i < normalizedEvent.payloads.length; i++) {
        const currentPayload = normalizedEvent.payloads[i];
        const response = await this.handleEvent(currentPayload);
        // build a combined body using multipart
        // https://www.w3.org/Protocols/rfc1341/7_2_Multipart.html
        combinedBody += `--${multipartBoundary}${CLRF}`;
        combinedBody += `content-type: ${
          response.headers['content-type'] || 'text/plain'
        }${CLRF}${CLRF}`;
        combinedBody += response.body || '';
        combinedBody += CLRF;

        if (i === normalizedEvent.payloads.length - 1) {
          combinedBody += `--${multipartBoundary}--${CLRF}`;
        }
        // pass non-200 status code in header so it can be handled
        // separately from other payloads e.g. HTML payload redirects
        // (307) but data payload does not (200)
        if (response.statusCode !== 200) {
          headers[`x-vercel-payload-${i + 1}-status`] =
            response.statusCode + '';
        }
        separateHeaders.push(response.headers);
        Object.keys(response.headers).forEach(key => allHeaderKeys.add(key));
      }

      allHeaderKeys.forEach(curKey => {
        /**
         * @type string | string[] | undefined
         */
        const curValue = separateHeaders[0] && separateHeaders[0][curKey];
        const canDedupe = separateHeaders.every(
          headers => headers[curKey] === curValue
        );

        if (canDedupe) {
          headers[curKey] = curValue;
        } else {
          // if a header is unique per payload ensure it is prefixed
          // so it can be parsed and provided separately
          separateHeaders.forEach((curHeaders, idx) => {
            if (curHeaders[curKey]) {
              headers[`x-vercel-payload-${idx + 1}-${curKey}`] =
                curHeaders[curKey];
            }
          });
        }
      });

      headers[
        'content-type'
      ] = `multipart/mixed; boundary="${multipartBoundary}"`;

      return {
        headers,
        statusCode,
        body: combinedBody,
        encoding: 'base64',
      };
    } else {
      // TODO We expect this to error as it is possible to resolve to empty.
      // For now it is not very important as we will only pass
      // `responseCallbackUrl` in production.
      // @ts-ignore
      return this.handleEvent(normalizedEvent);
    }
  }

  /**
   *
   * @param {ReturnType<typeof normalizeEvent>} normalizedEvent
   * @return {Promise<import('./types').VercelProxyResponse | import('./types').VercelStreamProxyResponse>}
   */
  async handleEvent(normalizedEvent) {
    const { port } = await this.listening;
    const {
      body,
      headers,
      isApiGateway,
      method,
      responseCallbackCipher,
      responseCallbackCipherIV,
      responseCallbackCipherKey,
      responseCallbackStream,
      responseCallbackUrl,
    } = normalizedEvent;
    let { path } = normalizedEvent;

    if (this.shouldStoreEvents) {
      const reqId = `${this.reqIdSeed++}`;
      this.events[reqId] = normalizedEvent;
      headers['x-now-bridge-request-id'] = reqId;
    }

    return new Promise((resolve, reject) => {
      let socket;
      let cipher;
      let url;

      if (responseCallbackUrl) {
        socket = new Socket();
        url = new URL(responseCallbackUrl);
        socket.connect(parseInt(url.port, 10), url.hostname);
        socket.write(`${responseCallbackStream}${CRLF}`);
      }

      if (
        responseCallbackCipher &&
        responseCallbackCipherKey &&
        responseCallbackCipherIV
      ) {
        cipher = createCipheriv(
          responseCallbackCipher,
          Buffer.from(responseCallbackCipherKey, 'base64'),
          Buffer.from(responseCallbackCipherIV, 'base64')
        );
      }

      // if the path is improperly encoded we need to encode it or
      // http.request will throw an error (related check: https://github.com/nodejs/node/blob/4ece669c6205ec78abfdadfe78869bbb8411463e/lib/_http_client.js#L84)
      if (path && /[^\u0021-\u00ff]/.test(path)) {
        path = encodeURI(path);
      }

      const req = request(
        { hostname: '127.0.0.1', port, path, method },
        socket && url && cipher
          ? getStreamResponseCallback({ url, socket, cipher, resolve, reject })
          : getResponseCallback({ isApiGateway, resolve, reject })
      );

      req.on('error', error => {
        setTimeout(() => {
          // this lets express print the true error of why the connection was closed.
          // it is probably 'Cannot set headers after they are sent to the client'
          reject(error);
        }, 2);
      });

      for (const [name, value] of getHeadersIterator(headers)) {
        try {
          req.setHeader(name, value);
        } catch (/** @type any */ err) {
          console.error(`Skipping HTTP request header: "${name}: ${value}"`);
          console.error(err.message);
        }
      }

      if (body) req.write(body);
      req.end();
    });
  }

  /**
   * @param {string} reqId
   * @return {import('./types').VercelProxyRequest}
   */
  consumeEvent(reqId) {
    const event = this.events[reqId];
    delete this.events[reqId];
    return event;
  }
}

/**
 * Generates the streaming response callback which writes in the given socket client a raw
 * HTTP Request message to later pipe the response body into the socket. It will pass request
 * headers namespace and an additional header with the status code. Once everything is
 * written it will destroy the socket and resolve to an empty object. If a cipher is given
 * it will be used to pipe bytes.
 *
 * @type {(params: {
 *  url: import('url').URL,
 *  socket: import('net').Socket,
 *  cipher: import('crypto').Cipher
 *  resolve: (result: (Record<string, never>)) => void,
 *  reject: (err: Error) => void
 * }) => (response: import("http").IncomingMessage) => void}
 */
function getStreamResponseCallback({ url, socket, cipher, resolve, reject }) {
  return response => {
    const chunked = new Transform();
    chunked._transform = function (chunk, _, callback) {
      this.push(Buffer.byteLength(chunk).toString(16) + CRLF);
      this.push(chunk);
      this.push(CRLF);
      callback();
    };

    let headers = `Host: ${url.host}${CRLF}`;
    headers += `transfer-encoding: chunked${CRLF}`;
    headers += `x-vercel-status-code: ${response.statusCode || 200}${CRLF}`;
    for (const [name, value] of getHeadersIterator(response.headers)) {
      if (!['connection', 'transfer-encoding'].includes(name)) {
        if (typeof value === 'string') {
          headers += `x-vercel-header-${name}: ${value}${CRLF}`;
        } else {
          for (const val of value) {
            headers += `x-vercel-header-${name}: ${val}${CRLF}`;
          }
        }
      }
    }

    cipher.write(`POST ${url.pathname} HTTP/1.1${CRLF}${headers}${CRLF}`);

    pipeline(response, chunked, cipher, socket, err => {
      if (err) return reject(err);
      resolve({});
    });
  };
}

/**
 * Generates the normal response callback which waits until the body is fully
 * received before resolving the promise. It caches the entire body and resolve
 * with an object that describes the response.
 *
 * @type {(params: {
 *  isApiGateway: boolean,
 *  resolve: (result: (import('./types').VercelProxyResponse)) => void,
 *  reject: (err: Error) => void
 * }) => (response: import("http").IncomingMessage) => void}
 */
function getResponseCallback({ isApiGateway, resolve, reject }) {
  return response => {
    /**
     * @type {Buffer[]}
     */
    const respBodyChunks = [];
    response.on('data', chunk => respBodyChunks.push(Buffer.from(chunk)));
    response.on('error', reject);
    response.on('end', () => {
      const bodyBuffer = Buffer.concat(respBodyChunks);
      delete response.headers.connection;

      if (isApiGateway) {
        delete response.headers['content-length'];
      } else if (response.headers['content-length']) {
        response.headers['content-length'] = String(bodyBuffer.length);
      }

      resolve({
        statusCode: response.statusCode || 200,
        headers: response.headers,
        body: bodyBuffer.toString('base64'),
        encoding: 'base64',
      });
    });
  };
}

/**
 * Get an iterator for the headers object and yield the name and value when
 * the value is not undefined only.
 *
 * @type {(headers: import('http').IncomingHttpHeaders) =>
 *  Generator<[string, string | string[]], void, unknown>}
 */
function* getHeadersIterator(headers) {
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      console.error(
        `Skipping HTTP request header "${name}" because value is undefined`
      );
      continue;
    }

    yield [name, value];
  }
}

module.exports = { Bridge };

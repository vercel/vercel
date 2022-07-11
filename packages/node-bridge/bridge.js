const { request } = require('http');

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
  const { method, path, headers, encoding, body, payloads } = JSON.parse(
    event.body
  );

  /**
   *
   * @param {string | Buffer} b
   * @returns Buffer
   */
  const normalizeBody = b => {
    if (b) {
      if (encoding === 'base64') {
        bodyBuffer = Buffer.from(b, encoding);
      } else if (encoding === undefined) {
        bodyBuffer = Buffer.from(b);
      } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
      }
    } else {
      bodyBuffer = Buffer.alloc(0);
    }
    return bodyBuffer;
  };

  if (payloads) {
    /**
     * @param {{ body: string | Buffer }} payload
     */
    const normalizePayload = payload => {
      payload.body = normalizeBody(payload.body);
    };
    payloads.forEach(normalizePayload);
  }
  bodyBuffer = normalizeBody(body);

  return {
    isApiGateway: false,
    method,
    path,
    headers,
    body: bodyBuffer,
    payloads,
  };
}

/**
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
 */
function normalizeAPIGatewayProxyEvent(event) {
  let bodyBuffer;
  const { httpMethod: method, path, headers, body } = event;

  if (body) {
    if (event.isBase64Encoded) {
      bodyBuffer = Buffer.from(body, 'base64');
    } else {
      bodyBuffer = Buffer.from(body);
    }
  } else {
    bodyBuffer = Buffer.alloc(0);
  }

  return { isApiGateway: true, method, path, headers, body: bodyBuffer };
}

/**
 * @param {import('./types').VercelProxyEvent | import('aws-lambda').APIGatewayProxyEvent} event
 */
function normalizeEvent(event) {
  if ('Action' in event) {
    if (event.Action === 'Invoke') {
      return normalizeProxyEvent(event);
    } else {
      throw new Error(`Unexpected event.Action: ${event.Action}`);
    }
  } else {
    return normalizeAPIGatewayProxyEvent(event);
  }
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
   * @param {import('./types').VercelProxyEvent | import('aws-lambda').APIGatewayProxyEvent} event
   * @param {import('aws-lambda').Context} context
   * @return {Promise<{statusCode: number, headers: import('http').IncomingHttpHeaders,  body: string, encoding: 'base64'}>}
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
      return this.handleEvent(normalizedEvent);
    }
  }

  /**
   *
   * @param {ReturnType<typeof normalizeEvent>} normalizedEvent
   * @return {Promise<{statusCode: number, headers: import('http').IncomingHttpHeaders,  body: string, encoding: 'base64'}>}
   */
  async handleEvent(normalizedEvent) {
    const { port } = await this.listening;
    const { isApiGateway, method, headers, body } = normalizedEvent;
    let { path } = normalizedEvent;

    if (this.shouldStoreEvents) {
      const reqId = `${this.reqIdSeed++}`;
      this.events[reqId] = normalizedEvent;
      headers['x-now-bridge-request-id'] = reqId;
    }

    // eslint-disable-next-line consistent-return
    return new Promise((resolve, reject) => {
      // if the path is improperly encoded we need to encode it or
      // http.request will throw an error (related check: https://github.com/nodejs/node/blob/4ece669c6205ec78abfdadfe78869bbb8411463e/lib/_http_client.js#L84)
      if (path && /[^\u0021-\u00ff]/.test(path)) {
        path = encodeURI(path);
      }

      const opts = { hostname: '127.0.0.1', port, path, method };
      const req = request(opts, res => {
        const response = res;
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
      });

      req.on('error', error => {
        setTimeout(() => {
          // this lets express print the true error of why the connection was closed.
          // it is probably 'Cannot set headers after they are sent to the client'
          reject(error);
        }, 2);
      });

      for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) {
          console.error(
            `Skipping HTTP request header "${name}" because value is undefined`
          );
          continue;
        }
        try {
          req.setHeader(name, value);
        } catch (err) {
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

module.exports = { Bridge };

const assert = require('assert');
const crypto = require('crypto');
const jsonlines = require('jsonlines');
const { Server } = require('http');
const { Bridge } = require('../bridge');
const { runServer } = require('./run-test-server');
const { runTcpServer } = require('./run-test-server');

test('port binding', async () => {
  const server = new Server();
  const bridge = new Bridge(server);
  bridge.listen();

  // Test port binding
  const info = await bridge.listening;
  assert.strictEqual(info.address, '127.0.0.1');
  assert.strictEqual(typeof info.port, 'number');

  server.close();
});

test('`NowProxyEvent` normalizing', async () => {
  const server = new Server((req, res) =>
    res.end(
      JSON.stringify({
        method: req.method,
        path: req.url,
        headers: req.headers,
      })
    )
  );

  let features;

  class CustomBridge extends Bridge {
    handleEvent(normalizedEvent) {
      features = normalizedEvent.features;
      return super.handleEvent(normalizedEvent);
    }
  }

  const bridge = new CustomBridge(server);
  bridge.listen();

  const context = { callbackWaitsForEmptyEventLoop: true };
  const result = await bridge.launcher(
    {
      Action: 'Invoke',
      body: JSON.stringify({
        method: 'POST',
        headers: { foo: 'baz' },
        features: { enabled: true },
        path: '/nowproxy',
        body: 'body=1',
      }),
    },
    context
  );
  assert.deepStrictEqual(features, { enabled: true });
  assert.strictEqual(result.encoding, 'base64');
  assert.strictEqual(result.statusCode, 200);
  const body = JSON.parse(Buffer.from(result.body, 'base64').toString());
  assert.strictEqual(body.method, 'POST');
  assert.strictEqual(body.path, '/nowproxy');
  assert.strictEqual(body.headers.foo, 'baz');
  assert.strictEqual(context.callbackWaitsForEmptyEventLoop, false);

  server.close();
});

test('multi-payload handling', async () => {
  const server = new Server((req, res) => {
    if (req.url === '/redirect') {
      res.setHeader('Location', '/somewhere');
      res.statusCode = 307;
      res.end('/somewhere');
      return;
    }
    res.setHeader(
      'content-type',
      req.url.includes('_next/data') ? 'application/json' : 'text/html'
    );

    res.end(
      JSON.stringify({
        method: req.method,
        path: req.url,
        headers: req.headers,
      })
    );
  });
  const bridge = new Bridge(server);
  bridge.listen();
  const context = { callbackWaitsForEmptyEventLoop: true };
  const result = await bridge.launcher(
    {
      Action: 'Invoke',
      body: JSON.stringify({
        payloads: [
          {
            method: 'GET',
            headers: { foo: 'baz' },
            path: '/nowproxy',
          },
          {
            method: 'GET',
            headers: { foo: 'baz' },
            path: '/_next/data/build-id/nowproxy.json',
          },
          {
            method: 'GET',
            headers: { foo: 'baz' },
            path: '/redirect',
          },
        ],
      }),
    },
    context
  );
  assert.strictEqual(result.encoding, 'base64');
  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(
    result.headers['content-type'],
    'multipart/mixed; boundary="payload-separator"'
  );
  const bodies = [];
  const payloadParts = result.body.split('\r\n');

  payloadParts.forEach(item => {
    if (
      item.trim() &&
      !item.startsWith('content-type:') &&
      !item.startsWith('--payload')
    ) {
      const content = Buffer.from(
        item.split('--payload-separator')[0],
        'base64'
      ).toString();
      bodies.push(content.startsWith('{') ? JSON.parse(content) : content);
    }
  });

  // ensure content-type is always specified as is required for
  // proper parsing of the multipart body
  assert(payloadParts.some(part => part.includes('content-type: text/plain')));

  assert.strictEqual(bodies[0].method, 'GET');
  assert.strictEqual(bodies[0].path, '/nowproxy');
  assert.strictEqual(bodies[0].headers.foo, 'baz');
  assert.strictEqual(bodies[1].method, 'GET');
  assert.strictEqual(bodies[1].path, '/_next/data/build-id/nowproxy.json');
  assert.strictEqual(bodies[1].headers.foo, 'baz');
  assert.strictEqual(bodies[2], '/somewhere');
  assert.strictEqual(result.headers['x-vercel-payload-3-status'], '307');
  assert.strictEqual(result.headers['x-vercel-payload-2-status'], undefined);
  assert.strictEqual(result.headers['x-vercel-payload-1-status'], undefined);
  assert.strictEqual(
    result.headers['x-vercel-payload-1-content-type'],
    'text/html'
  );
  assert.strictEqual(
    result.headers['x-vercel-payload-2-content-type'],
    'application/json'
  );
  assert.strictEqual(
    result.headers['x-vercel-payload-3-content-type'],
    undefined
  );
  assert.strictEqual(
    result.headers['x-vercel-payload-3-location'],
    '/somewhere'
  );
  assert.strictEqual(result.headers['x-vercel-payload-2-location'], undefined);
  assert.strictEqual(context.callbackWaitsForEmptyEventLoop, false);

  server.close();
});

test('consumeEvent', async () => {
  const mockListener = jest.fn((_, res) => {
    res.end('hello');
  });

  const server = new Server(mockListener);
  const bridge = new Bridge(server, true);
  bridge.listen();

  const context = { callbackWaitsForEmptyEventLoop: true };
  await bridge.launcher(
    {
      Action: 'Invoke',
      body: JSON.stringify({
        method: 'POST',
        headers: { foo: 'baz' },
        path: '/nowproxy',
        body: 'body=1',
      }),
    },
    context
  );

  const headers = mockListener.mock.calls[0][0].headers;
  const reqId = headers['x-now-bridge-request-id'];

  expect(reqId).toBeTruthy();

  const event = bridge.consumeEvent(reqId);
  expect(event.body.toString()).toBe('body=1');

  // an event can't be consumed multiple times
  // to avoid memory leaks
  expect(bridge.consumeEvent(reqId)).toBeUndefined();

  server.close();
});

test('consumeEvent and handle decoded path', async () => {
  const mockListener = jest.fn((_, res) => {
    res.end('hello');
  });

  const server = new Server(mockListener);
  const bridge = new Bridge(server, true);
  bridge.listen();

  const context = { callbackWaitsForEmptyEventLoop: true };
  await bridge.launcher(
    {
      Action: 'Invoke',
      body: JSON.stringify({
        method: 'POST',
        headers: { foo: 'baz' },
        path: '/now proxy',
        body: 'body=1',
      }),
    },
    context
  );

  const headers = mockListener.mock.calls[0][0].headers;
  const reqId = headers['x-now-bridge-request-id'];

  expect(reqId).toBeTruthy();

  const event = bridge.consumeEvent(reqId);
  expect(event.body.toString()).toBe('body=1');

  // an event can't be consumed multiple times
  // to avoid memory leaks
  expect(bridge.consumeEvent(reqId)).toBeUndefined();

  server.close();
});

test('invalid request headers', async () => {
  const server = new Server((req, res) =>
    res.end(
      JSON.stringify({
        method: req.method,
        path: req.url,
        headers: req.headers,
      })
    )
  );
  const bridge = new Bridge(server);
  bridge.listen();
  const context = { callbackWaitsForEmptyEventLoop: true };
  const result = await bridge.launcher(
    {
      Action: 'Invoke',
      body: JSON.stringify({
        method: 'GET',
        headers: { foo: 'baz\n', ok: 'true' },
        path: '/nowproxy',
        body: 'body=1',
      }),
    },
    context
  );
  assert.strictEqual(result.encoding, 'base64');
  assert.strictEqual(result.statusCode, 200);
  const body = JSON.parse(Buffer.from(result.body, 'base64').toString());
  assert.strictEqual(body.method, 'GET');
  assert.strictEqual(body.path, '/nowproxy');
  assert.strictEqual(body.headers.ok, 'true');
  assert(!body.headers.foo);
  assert.strictEqual(context.callbackWaitsForEmptyEventLoop, false);

  server.close();
});

test('`NowProxyEvent` proxy streaming with a sync handler', async () => {
  const cipherParams = {
    cipher: 'aes-256-ctr',
    cipherIV: crypto.randomBytes(16),
    cipherKey: crypto.randomBytes(32),
  };

  const effects = {
    callbackPayload: undefined,
    callbackStream: undefined,
  };

  const { deferred, resolve } = createDeferred();

  const httpServer = await runServer({
    handler: (req, res) => {
      const chunks = [];
      req.on('data', chunk => {
        chunks.push(chunk.toString());
      });
      req.on('close', () => {
        effects.callbackPayload = chunks;
        res.writeHead(200, 'OK', { 'content-type': 'application/json' });
        res.end();
        resolve();
      });
    },
  });

  const tcpServerCallback = await runTcpServer({
    cipherParams,
    effects,
    httpServer,
  });

  const server = new Server((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('hello');
  });

  const bridge = new Bridge(server);
  bridge.listen();
  const context = { callbackWaitsForEmptyEventLoop: true };
  const result = await bridge.launcher(
    {
      Action: 'Invoke',
      body: JSON.stringify({
        method: 'POST',
        responseCallbackCipher: cipherParams.cipher,
        responseCallbackCipherIV: cipherParams.cipherIV.toString('base64'),
        responseCallbackCipherKey: cipherParams.cipherKey.toString('base64'),
        responseCallbackStream: 'abc',
        responseCallbackUrl: String(tcpServerCallback.url),
        headers: { foo: 'bar' },
        path: '/nowproxy',
        body: 'body=1',
      }),
    },
    context
  );

  await deferred;

  expect(result).toEqual({});
  expect(context.callbackWaitsForEmptyEventLoop).toEqual(false);
  expect(effects.callbackStream).toEqual('abc');
  expect(effects.callbackPayload).toEqual(['hello']);

  server.close();
  await httpServer.close();
  await tcpServerCallback.close();
});

test('`NowProxyEvent` proxy streaming with an async handler', async () => {
  const effects = {
    callbackHeaders: undefined,
    callbackMethod: undefined,
    callbackPayload: undefined,
    callbackStream: undefined,
  };

  const cipherParams = {
    cipher: 'aes-256-ctr',
    cipherIV: crypto.randomBytes(16),
    cipherKey: crypto.randomBytes(32),
  };

  const { deferred, resolve } = createDeferred();
  const jsonParser = jsonlines.parse();
  const httpServer = await runServer({
    handler: (req, res) => {
      const chunks = [];
      req.pipe(jsonParser);
      jsonParser.on('data', chunk => {
        chunks.push(chunk);
      });
      req.on('close', () => {
        effects.callbackMethod = req.method;
        effects.callbackHeaders = req.headers;
        effects.callbackPayload = chunks;
        res.writeHead(200, 'OK', { 'content-type': 'application/json' });
        res.end();
        resolve();
      });
    },
  });

  const tcpServerCallback = await runTcpServer({
    cipherParams,
    httpServer,
    effects,
  });

  const jsonStringifier = jsonlines.stringify();
  const server = new Server((req, res) => {
    res.setHeader('x-test', 'hello');
    res.setHeader('content-type', 'text/html');
    jsonStringifier.pipe(res);
    jsonStringifier.write({ method: req.method });
    jsonStringifier.write({ path: req.url });
    setTimeout(() => {
      jsonStringifier.write({ headers: req.headers });
      res.end();
    }, 100);
  });

  const bridge = new Bridge(server);
  bridge.listen();
  const context = { callbackWaitsForEmptyEventLoop: true };
  const result = await bridge.launcher(
    {
      Action: 'Invoke',
      body: JSON.stringify({
        method: 'POST',
        responseCallbackCipher: cipherParams.cipher,
        responseCallbackCipherIV: cipherParams.cipherIV.toString('base64'),
        responseCallbackCipherKey: cipherParams.cipherKey.toString('base64'),
        responseCallbackStream: 'abc',
        responseCallbackUrl: String(tcpServerCallback.url),
        headers: { foo: 'bar' },
        path: '/nowproxy',
        body: 'body=1',
      }),
    },
    context
  );

  await deferred;

  expect(result).toEqual({});
  expect(context.callbackWaitsForEmptyEventLoop).toEqual(false);
  expect(effects.callbackStream).toEqual('abc');
  expect(effects.callbackMethod).toEqual('POST');
  expect(effects.callbackHeaders).toMatchObject({
    'x-vercel-status-code': '200',
    'x-vercel-header-x-test': 'hello',
    'x-vercel-header-content-type': 'text/html',
  });
  expect(effects.callbackPayload).toMatchObject([
    { method: 'POST' },
    { path: '/nowproxy' },
    { headers: { foo: 'bar' } },
  ]);

  server.close();
  httpServer.close();
  tcpServerCallback.close();
});

function createDeferred() {
  let resolve;
  const deferred = new Promise(_resolve => {
    resolve = _resolve;
  });
  return { deferred, resolve };
}

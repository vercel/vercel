import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import jsonlines from 'jsonlines';
import { Server } from 'http';
import { Bridge } from '../bridge';
import { runServer } from './run-test-server';
import { runTcpServer } from './run-test-server';

beforeEach(() => vi.clearAllMocks());
// comment .mockImplementation(() => {}); to see error in test logs
const error = vi.spyOn(console, 'error').mockImplementation(() => {});

let server;
afterEach(() => server?.close());

it('port binding', async () => {
  server = new Server();
  const bridge = new Bridge(server);
  bridge.listen();

  // Test port binding
  const info = await bridge.listening;
  expect(info.address).toEqual('127.0.0.1');
  expect(info.port).toBeTypeOf('number');
});

it('`APIGatewayProxyEvent` normalizing', async () => {
  server = new Server((req, res) =>
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
  const context = {};
  const result = await bridge.launcher(
    {
      httpMethod: 'GET',
      headers: { foo: 'bar' },
      path: '/apigateway',
      body: null,
    },
    context
  );
  expect(result.encoding).toEqual('base64');
  expect(result.statusCode).toEqual(200);
  expect(JSON.parse(Buffer.from(result.body, 'base64').toString())).toEqual({
    method: 'GET',
    path: '/apigateway',
    headers: expect.objectContaining({ foo: 'bar' }),
  });
  expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
});

it('`NowProxyEvent` normalizing', async () => {
  server = new Server((req, res) =>
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
        method: 'POST',
        headers: { foo: 'baz' },
        path: '/nowproxy',
        body: 'body=1',
      }),
    },
    context
  );

  expect(result.encoding).toEqual('base64');
  expect(result.statusCode).toEqual(200);
  expect(JSON.parse(Buffer.from(result.body, 'base64').toString())).toEqual({
    method: 'POST',
    path: '/nowproxy',
    headers: expect.objectContaining({ foo: 'baz' }),
  });
  expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
});

it('multi-payload handling', async () => {
  server = new Server((req, res) => {
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

  expect(result.encoding).toEqual('base64');
  expect(result.statusCode).toEqual(200);
  expect(result.headers).toHaveProperty(
    'content-type',
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
  expect(
    payloadParts.some(part => part.includes('content-type: text/plain'))
  ).toBeTruthy();

  expect(bodies).toEqual([
    {
      method: 'GET',
      path: '/nowproxy',
      headers: expect.objectContaining({ foo: 'baz' }),
    },
    {
      method: 'GET',
      path: '/_next/data/build-id/nowproxy.json',
      headers: expect.objectContaining({ foo: 'baz' }),
    },
    '/somewhere',
  ]);
  expect(result.headers).toMatchObject({
    'x-vercel-payload-3-status': '307',
    'x-vercel-payload-1-content-type': 'text/html',
    'x-vercel-payload-2-content-type': 'application/json',
    'x-vercel-payload-3-location': '/somewhere',
  });
  expect(result.headers).not.toHaveProperty('x-vercel-payload-2-status');
  expect(result.headers).not.toHaveProperty('x-vercel-payload-1-status');
  expect(result.headers).not.toHaveProperty('x-vercel-payload-3-content-type');
  expect(result.headers).not.toHaveProperty('x-vercel-payload-2-location');
  expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
});

it('consumeEvent', async () => {
  const mockListener = vi.fn((_, res) => res.end('hello'));

  server = new Server(mockListener);
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
});

it('consumeEvent and handle decoded path', async () => {
  const mockListener = vi.fn((_, res) => res.end('hello'));

  server = new Server(mockListener);
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
});

it('invalid request headers', async () => {
  server = new Server((req, res) =>
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
  expect(result.encoding).toEqual('base64');
  expect(result.statusCode).toEqual(200);
  const body = JSON.parse(Buffer.from(result.body, 'base64').toString());
  expect(body).toEqual({
    method: 'GET',
    path: '/nowproxy',
    headers: expect.objectContaining({ ok: 'true' }),
  });
  expect(body.headers).not.toHaveProperty('foo');
  expect(context.callbackWaitsForEmptyEventLoop).toBe(false);

  expect(error).nthCalledWith(1, 'Skipping HTTP request header: "foo: baz\n"');
  expect(error).nthCalledWith(2, 'Invalid character in header content ["foo"]');
  expect(error).toBeCalledTimes(2);
});

describe('given `NowProxyEvent` proxy server', () => {
  const cipherParams = {
    cipher: 'aes-256-ctr',
    cipherIV: crypto.randomBytes(16),
    cipherKey: crypto.randomBytes(32),
  };

  const effects = {
    callbackHeaders: undefined,
    callbackMethod: undefined,
    callbackPayload: undefined,
    callbackStream: undefined,
  };

  let deferred;
  let resolve;
  let httpServer;
  let tcpServerCallback;

  beforeEach(async () => {
    const jsonParser = jsonlines.parse();

    httpServer = await runServer({
      handler: (req, res) => {
        const chunks = [];
        if (
          req.headers['x-vercel-header-content-type'] === 'application/json'
        ) {
          req.pipe(jsonParser);
          jsonParser.on('data', chunk => chunks.push(chunk));
        } else {
          req.on('data', chunk => chunks.push(chunk.toString()));
        }
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

    tcpServerCallback = await runTcpServer({
      cipherParams,
      effects,
      httpServer,
    });

    deferred = new Promise(_resolve => {
      resolve = _resolve;
    });
  });

  afterEach(async () => {
    await httpServer.close();
    await tcpServerCallback.close();
  });

  it('streams with a sync handler', async () => {
    server = new Server((req, res) => {
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
  });

  it('streams with an async handler', async () => {
    const jsonStringifier = jsonlines.stringify();
    server = new Server((req, res) => {
      res.setHeader('x-test', 'hello');
      res.setHeader('content-type', 'application/json');
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
      'x-vercel-header-content-type': 'application/json',
    });
    expect(effects.callbackPayload).toMatchObject([
      { method: 'POST' },
      { path: '/nowproxy' },
      { headers: { foo: 'bar' } },
    ]);
  });
});

const assert = require('assert');
const { Server } = require('http');
const { Bridge } = require('../bridge');

test('port binding', async () => {
  const server = new Server();
  const bridge = new Bridge(server);
  bridge.listen();

  // Test port binding
  const info = await bridge.listening;
  assert.equal(info.address, '127.0.0.1');
  assert.equal(typeof info.port, 'number');

  server.close();
});

test('`APIGatewayProxyEvent` normalizing', async () => {
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
  assert.equal(result.encoding, 'base64');
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(Buffer.from(result.body, 'base64').toString());
  assert.equal(body.method, 'GET');
  assert.equal(body.path, '/apigateway');
  assert.equal(body.headers.foo, 'bar');
  assert.equal(context.callbackWaitsForEmptyEventLoop, false);

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
  assert.equal(result.encoding, 'base64');
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(Buffer.from(result.body, 'base64').toString());
  assert.equal(body.method, 'POST');
  assert.equal(body.path, '/nowproxy');
  assert.equal(body.headers.foo, 'baz');
  assert.equal(context.callbackWaitsForEmptyEventLoop, false);

  server.close();
});

test('multi-payload handling', async () => {
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
        ],
      }),
    },
    context
  );
  assert.equal(result.encoding, 'base64');
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  const body1 = JSON.parse(Buffer.from(body['/nowproxy'], 'base64').toString());
  const body2 = JSON.parse(
    Buffer.from(body['/_next/data/build-id/nowproxy.json'], 'base64').toString()
  );

  assert.equal(body1.method, 'GET');
  assert.equal(body1.path, '/nowproxy');
  assert.equal(body1.headers.foo, 'baz');
  assert.equal(body2.method, 'GET');
  assert.equal(body2.path, '/_next/data/build-id/nowproxy.json');
  assert.equal(body2.headers.foo, 'baz');
  assert.equal(context.callbackWaitsForEmptyEventLoop, false);

  server.close();
});

test('consumeEvent', async () => {
  const mockListener = jest.fn((req, res) => {
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
  const mockListener = jest.fn((req, res) => {
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
  assert.equal(result.encoding, 'base64');
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(Buffer.from(result.body, 'base64').toString());
  assert.equal(body.method, 'GET');
  assert.equal(body.path, '/nowproxy');
  assert.equal(body.headers.ok, 'true');
  assert(!body.headers.foo);
  assert.equal(context.callbackWaitsForEmptyEventLoop, false);

  server.close();
});

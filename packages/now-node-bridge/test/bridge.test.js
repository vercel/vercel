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

/* global beforeEach, afterEach, expect, it, jest */
const fetch = require('node-fetch');
const listen = require('test-listen');
const qs = require('querystring');

const { createServerWithHelpers } = require('../dist/helpers');

const mockListener = jest.fn();
const consumeEventMock = jest.fn();
const mockBridge = { consumeEvent: consumeEventMock };

let server;
let url;

async function fetchWithProxyReq(_url, opts = {}) {
  if (opts.body) {
    // eslint-disable-next-line
    opts = { ...opts, body: Buffer.from(opts.body) };
  }

  consumeEventMock.mockImplementationOnce(() => opts);

  return fetch(_url, {
    ...opts,
    headers: { ...opts.headers, 'x-now-bridge-request-id': '2' },
  });
}

beforeEach(async () => {
  mockListener.mockClear();
  consumeEventMock.mockClear();

  mockListener.mockImplementation((req, res) => {
    res.send('hello');
  });
  consumeEventMock.mockImplementation(() => ({}));

  server = createServerWithHelpers(mockListener, mockBridge);
  url = await listen(server);
});

afterEach(async () => {
  await server.close();
});

describe('contract with @now/node-bridge', () => {
  test('should call consumeEvent with the correct reqId', async () => {
    await fetchWithProxyReq(`${url}/`);

    expect(consumeEventMock).toHaveBeenLastCalledWith('2');
  });

  test('should not expose the request id header', async () => {
    await fetchWithProxyReq(`${url}/`, { headers: { 'x-test-header': 'ok' } });

    const [{ headers }] = mockListener.mock.calls[0];

    expect(headers['x-now-bridge-request-id']).toBeUndefined();
    expect(headers['x-test-header']).toBe('ok');
  });
});

describe('all helpers', () => {
  const nowHelpers = [
    ['query', 0],
    ['cookies', 0],
    ['body', 0],
    ['status', 1],
    ['send', 1],
    ['json', 1],
  ];

  test('should not recalculate req properties twice', async () => {
    const spy = jest.fn(() => {});

    const nowReqHelpers = nowHelpers.filter(([, i]) => i === 0);

    mockListener.mockImplementation((req, res) => {
      spy(...nowReqHelpers.map(h => req[h]));
      spy(...nowReqHelpers.map(h => req[h]));
      res.end();
    });

    await fetchWithProxyReq(`${url}/?who=bill`, {
      method: 'POST',
      body: JSON.stringify({ who: 'mike' }),
      headers: { 'content-type': 'application/json', cookie: 'who=jim' },
    });

    // here we test that bodySpy is called twice with exactly the same arguments
    for (let i = 0; i < 3; i += 1) {
      expect(spy.mock.calls[0][i]).toBe(spy.mock.calls[1][i]);
    }
  });

  test('should be able to overwrite request properties', async () => {
    const spy = jest.fn(() => {});

    mockListener.mockImplementation((...args) => {
      nowHelpers.forEach(([prop, n]) => {
        /* eslint-disable */
        args[n][prop] = 'ok';
        args[n][prop] = 'ok2';
        spy(args[n][prop]);
      });

      args[1].end();
    });

    await fetchWithProxyReq(url);

    nowHelpers.forEach((_, i) => expect(spy.mock.calls[i][0]).toBe('ok2'));
  });

  test('should be able to reconfig request properties', async () => {
    const spy = jest.fn(() => {});

    mockListener.mockImplementation((...args) => {
      nowHelpers.forEach(([prop, n]) => {
        // eslint-disable-next-line
        Object.defineProperty(args[n], prop, { value: 'ok' });
        Object.defineProperty(args[n], prop, { value: 'ok2' });
        spy(args[n][prop]);
      });

      args[1].end();
    });

    await fetchWithProxyReq(url);

    nowHelpers.forEach((_, i) => expect(spy.mock.calls[i][0]).toBe('ok2'));
  });
});

describe('req.query', () => {
  test('req.query should reflect querystring in the url', async () => {
    await fetchWithProxyReq(`${url}/?who=bill&where=us`);

    expect(mockListener.mock.calls[0][0].query).toMatchObject({
      who: 'bill',
      where: 'us',
    });
  });

  test('req.query should be {} when there is no querystring', async () => {
    await fetchWithProxyReq(url);
    const [{ query }] = mockListener.mock.calls[0];
    expect(Object.keys(query).length).toBe(0);
  });
});

describe('req.cookies', () => {
  test('req.cookies should reflect req.cookie header', async () => {
    await fetchWithProxyReq(url, {
      headers: {
        cookie: 'who=bill; where=us',
      },
    });

    expect(mockListener.mock.calls[0][0].cookies).toMatchObject({
      who: 'bill',
      where: 'us',
    });
  });
});

describe('req.body', () => {
  test('req.body should be undefined by default', async () => {
    await fetchWithProxyReq(url);
    expect(mockListener.mock.calls[0][0].body).toBe(undefined);
  });

  test('req.body should be undefined if content-type is not defined', async () => {
    await fetchWithProxyReq(url, {
      method: 'POST',
      body: 'hello',
    });
    expect(mockListener.mock.calls[0][0].body).toBe(undefined);
  });

  test('req.body should be a string when content-type is `text/plain`', async () => {
    await fetchWithProxyReq(url, {
      method: 'POST',
      body: 'hello',
      headers: { 'content-type': 'text/plain' },
    });

    expect(mockListener.mock.calls[0][0].body).toBe('hello');
  });

  test('req.body should be a buffer when content-type is `application/octet-stream`', async () => {
    await fetchWithProxyReq(url, {
      method: 'POST',
      body: 'hello',
      headers: { 'content-type': 'application/octet-stream' },
    });

    const [{ body }] = mockListener.mock.calls[0];

    const str = body.toString();

    expect(Buffer.isBuffer(body)).toBe(true);
    expect(str).toBe('hello');
  });

  test('req.body should be an object when content-type is `application/x-www-form-urlencoded`', async () => {
    const obj = { who: 'mike' };

    await fetchWithProxyReq(url, {
      method: 'POST',
      body: qs.encode(obj),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(mockListener.mock.calls[0][0].body).toMatchObject(obj);
  });

  test('req.body should be an object when content-type is `application/json`', async () => {
    const json = {
      who: 'bill',
      where: 'us',
    };

    await fetchWithProxyReq(url, {
      method: 'POST',
      body: JSON.stringify(json),
      headers: { 'content-type': 'application/json' },
    });

    expect(mockListener.mock.calls[0][0].body).toMatchObject(json);
  });

  test('should throw error when body is empty and content-type is `application/json`', async () => {
    mockListener.mockImplementation((req, res) => {
      console.log(req.body);
      res.end();
    });

    const res = await fetchWithProxyReq(url, {
      method: 'POST',
      body: '',
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(400);
  });

  test('should be able to try/catch parse errors', async () => {
    const bodySpy = jest.fn(() => {});

    mockListener.mockImplementation((req, res) => {
      try {
        if (req.body === undefined) res.status(400);
      } catch (error) {
        bodySpy(error);
      } finally {
        res.end();
      }
    });

    await fetchWithProxyReq(url, {
      method: 'POST',
      body: '{"wrong":"json"',
      headers: { 'content-type': 'application/json' },
    });

    expect(bodySpy).toHaveBeenCalled();

    const [error] = bodySpy.mock.calls[0];
    expect(error.message).toMatch(/invalid json/i);
    expect(error.statusCode).toBe(400);
  });
});

describe('res.send()', () => {
  test('res.send() should set body to ""', async () => {
    mockListener.mockImplementation((req, res) => {
      res.send();
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  test('res.send(null) should set body to ""', async () => {
    mockListener.mockImplementation((req, res) => {
      res.send(null);
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  test('res.send(undefined) should set body to ""', async () => {
    mockListener.mockImplementation((req, res) => {
      res.send(undefined);
    });
    const res = await fetchWithProxyReq(url);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  test('res.send(String) should send as text/plain', async () => {
    mockListener.mockImplementation((req, res) => {
      res.send('hey');
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('hey');
  });

  test('res.send(String) should not override Content-Type', async () => {
    mockListener.mockImplementation((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.send('hey');
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toBe('hey');
  });

  test('res.send(String) should set Content-Length', async () => {
    mockListener.mockImplementation((req, res) => {
      res.send('½ + ¼ = ¾');
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(Number(res.headers.get('content-length'))).toBe(12);
    expect(await res.text()).toBe('½ + ¼ = ¾');
  });

  test('res.send(Buffer) should send as octet-stream', async () => {
    mockListener.mockImplementation((req, res) => {
      res.send(Buffer.from('hello'));
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(await res.text()).toBe('hello');
  });

  test('res.send(Buffer) should not override Content-Type', async () => {
    mockListener.mockImplementation((req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.send(Buffer.from('hello'));
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(await res.text()).toBe('hello');
  });

  test('res.send(Buffer) should set Content-Length', async () => {
    mockListener.mockImplementation((req, res) => {
      res.send(Buffer.from('½ + ¼ = ¾'));
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(Number(res.headers.get('content-length'))).toBe(12);
    expect(await res.text()).toBe('½ + ¼ = ¾');
  });

  test('res.send(Object) should send as application/json', async () => {
    mockListener.mockImplementation((req, res) => {
      res.send({ name: 'tobi' });
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(await res.text()).toBe('{"name":"tobi"}');
  });

  test('res.send(Stream) should send as application/octet-stream', async () => {
    const { PassThrough } = require('stream');

    mockListener.mockImplementation((req, res) => {
      const stream = new PassThrough();
      res.send(stream);
      stream.push('hello');
      stream.end();
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(await res.text()).toBe('hello');
  });

  test('res.send() should send be chainable', async () => {
    const spy = jest.fn();

    mockListener.mockImplementation((req, res) => {
      spy(res, res.send('hello'));
    });

    await fetchWithProxyReq(url);

    const [a, b] = spy.mock.calls[0];
    expect(a).toBe(b);
  });
});

describe('res.json()', () => {
  test('res.json() should not override previous Content-Type', async () => {
    mockListener.mockImplementation((req, res) => {
      res.setHeader('Content-Type', 'application/vnd.example+json');
      res.json({ hello: 'world' });
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.example+json'
    );
    expect(await res.text()).toBe('{"hello":"world"}');
  });

  test('res.json() should send as application/json', async () => {
    mockListener.mockImplementation((req, res) => {
      res.json({ hello: 'world' });
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(await res.text()).toBe('{"hello":"world"}');
  });

  test('res.json() should set Content-Length and Content-Type', async () => {
    mockListener.mockImplementation((req, res) => {
      res.json({ hello: '½ + ¼ = ¾' });
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(Number(res.headers.get('content-length'))).toBe(24);
    expect(await res.text()).toBe('{"hello":"½ + ¼ = ¾"}');
  });

  test('res.json(null) should respond with json for null', async () => {
    mockListener.mockImplementation((req, res) => {
      res.json(null);
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(await res.text()).toBe('null');
  });

  test('res.json() should throw an error', async () => {
    let _err;
    mockListener.mockImplementation((req, res) => {
      try {
        res.json();
      } catch (err) {
        _err = err;
      } finally {
        res.end();
      }
    });

    await fetchWithProxyReq(url);
    expect(_err).toBeDefined();
    expect(_err.message).toMatch(/not a valid object/);
  });

  test('res.json(undefined) should throw an error', async () => {
    let _err;
    mockListener.mockImplementation((req, res) => {
      try {
        res.json(undefined);
      } catch (err) {
        _err = err;
      } finally {
        res.end();
      }
    });

    await fetchWithProxyReq(url);
    expect(_err).toBeDefined();
    expect(_err.message).toMatch(/not a valid object/);
  });

  test('res.json(Number) should respond with json for number', async () => {
    mockListener.mockImplementation((req, res) => {
      res.json(300);
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(await res.text()).toBe('300');
  });

  test('res.json(String) should respond with json for string', async () => {
    mockListener.mockImplementation((req, res) => {
      res.json('str');
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(await res.text()).toBe('"str"');
  });

  test('res.json(Array) should respond with json for array', async () => {
    mockListener.mockImplementation((req, res) => {
      res.json(['foo', 'bar', 'baz']);
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(await res.text()).toBe('["foo","bar","baz"]');
  });

  test('res.json(Object) should respond with json for object', async () => {
    mockListener.mockImplementation((req, res) => {
      res.json({ name: 'tobi' });
    });

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(await res.text()).toBe('{"name":"tobi"}');
  });

  test('res.json() should send be chainable', async () => {
    const spy = jest.fn();

    mockListener.mockImplementation((req, res) => {
      spy(res, res.json({ hello: 'world' }));
    });

    await fetchWithProxyReq(url);

    const [a, b] = spy.mock.calls[0];
    expect(a).toBe(b);
  });
});

describe('res.status()', () => {
  test('res.status() should set the status code', async () => {
    mockListener.mockImplementation((req, res) => {
      res.status(404);
      res.end();
    });

    const res = await fetchWithProxyReq(url);

    expect(res.status).toBe(404);
  });

  test('res.status() should be chainable', async () => {
    const spy = jest.fn();

    mockListener.mockImplementation((req, res) => {
      spy(res, res.status(404));
      res.end();
    });

    await fetchWithProxyReq(url);

    const [a, b] = spy.mock.calls[0];
    expect(a).toBe(b);
  });
});

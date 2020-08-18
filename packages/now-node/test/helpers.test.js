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
    ['redirect', 1],
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

  test('req.query should turn multiple params with same name into an array', async () => {
    await fetchWithProxyReq(`${url}/?a=2&a=1`);

    expect(mockListener.mock.calls[0][0].query).toMatchObject({
      a: ['2', '1'],
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

  test('should work when body is empty and content-type is `application/json`', async () => {
    mockListener.mockImplementation((req, res) => {
      console.log(req.body);
      res.end();
    });

    const res = await fetchWithProxyReq(url, {
      method: 'POST',
      body: '',
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({});
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

describe('res.status', () => {
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

describe('res.redirect', () => {
  test('should redirect to login', async () => {
    mockListener.mockImplementation((req, res) => {
      res.redirect('/login');
      res.end();
    });

    const res = await fetchWithProxyReq(url, { redirect: 'manual' });

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(url + '/login');
  });
  test('should redirect with status code 301', async () => {
    mockListener.mockImplementation((req, res) => {
      res.redirect(301, '/login');
      res.end();
    });
    const res = await fetchWithProxyReq(url, { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(url + '/login');
  });
  test('should show friendly error for invalid redirect', async () => {
    let error;
    mockListener.mockImplementation((req, res) => {
      try {
        res.redirect(307);
      } catch (err) {
        error = err;
      }
      res.end();
    });
    await fetchWithProxyReq(url, { redirect: 'manual' });
    expect(error.message).toBe(
      `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
    );
  });
  test('should show friendly error in case of passing null as first argument redirect', async () => {
    let error;
    mockListener.mockImplementation((req, res) => {
      try {
        res.redirect(null);
      } catch (err) {
        error = err;
      }
      res.end();
    });
    await fetchWithProxyReq(url, { redirect: 'manual' });
    expect(error.message).toBe(
      `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
    );
  });
});

// tests based on expressjs test suite
// see https://github.com/expressjs/express/blob/master/test/res.send.js
describe('res.send', () => {
  test('should be chainable', async () => {
    const spy = jest.fn();

    mockListener.mockImplementation((req, res) => {
      spy(res, res.send('hello'));
    });

    await fetchWithProxyReq(url);

    const [a, b] = spy.mock.calls[0];
    expect(a).toBe(b);
  });

  describe('res.send()', () => {
    test('should set body to ""', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send();
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('');
    });
  });

  describe('.send(null)', () => {
    test('should set body to ""', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send(null);
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-length')).toBe('0');
      expect(await res.text()).toBe('');
    });
  });

  describe('.send(undefined)', () => {
    test('should set body to ""', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send(undefined);
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('');
    });
  });

  describe('.send(String)', () => {
    test('should send as html', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send('<p>hey</p>');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await res.text()).toBe('<p>hey</p>');
    });

    test('should set Content-Length', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send('½ + ¼ = ¾');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(Number(res.headers.get('content-length'))).toBe(12);
      expect(await res.text()).toBe('½ + ¼ = ¾');
    });

    test('should set ETag', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send(Array(1000).join('-'));
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe(
        'W/"3e7-qPnkJ3CVdVhFJQvUBfF10TmVA7g"'
      );
    });

    test('should not override Content-Type', async () => {
      mockListener.mockImplementation((req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.send('hey');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(await res.text()).toBe('hey');
    });

    test('should override charset in Content-Type', async () => {
      mockListener.mockImplementation((req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
        res.send('hey');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(await res.text()).toBe('hey');
    });
  });

  describe('.send(Buffer)', () => {
    test('should keep charset in Content-Type', async () => {
      mockListener.mockImplementation((req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
        res.send(Buffer.from('hi'));
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe(
        'text/plain; charset=iso-8859-1'
      );
      expect(await res.text()).toBe('hi');
    });

    test('should set Content-Length', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send(Buffer.from('½ + ¼ = ¾'));
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(Number(res.headers.get('content-length'))).toBe(12);
      expect(await res.text()).toBe('½ + ¼ = ¾');
    });

    test('should send as octet-stream', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send(Buffer.from('hello'));
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
      expect((await res.buffer()).toString('hex')).toBe(
        Buffer.from('hello').toString('hex')
      );
    });

    test('should set ETag', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send(Buffer.alloc(999, '-'));
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe(
        'W/"3e7-qPnkJ3CVdVhFJQvUBfF10TmVA7g"'
      );
    });

    test('should not override Content-Type', async () => {
      mockListener.mockImplementation((req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(Buffer.from('hey'));
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(await res.text()).toBe('hey');
    });

    test('should not override ETag', async () => {
      mockListener.mockImplementation((req, res) => {
        res.setHeader('ETag', '"foo"');
        res.send(Buffer.from('hey'));
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe('"foo"');
      expect(await res.text()).toBe('hey');
    });
  });

  describe('.send(Object)', () => {
    test('should send as application/json', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send({ name: 'tobi' });
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      );
      expect(await res.text()).toBe('{"name":"tobi"}');
    });
  });

  describe('when the request method is HEAD', () => {
    test('should ignore the body', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send('yay');
      });

      // TODO: fix this test
      // node-fetch is automatically ignoring the body so this test will never fail
      const res = await fetchWithProxyReq(url, { method: 'HEAD' });
      expect(res.status).toBe(200);
      expect((await res.buffer()).toString()).toBe('');
    });
  });

  describe('when .statusCode is 204', () => {
    test('should strip Content-* fields, Transfer-Encoding field, and body', async () => {
      mockListener.mockImplementation((req, res) => {
        res.statusCode = 204;
        res.setHeader('Transfer-Encoding', 'chunked');
        res.send('foo');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(204);
      expect(res.headers.get('Content-Type')).toBe(null);
      expect(res.headers.get('Content-Length')).toBe(null);
      expect(res.headers.get('Transfer-Encoding')).toBe(null);
      expect(await res.text()).toBe('');
    });
  });

  describe('when .statusCode is 304', () => {
    test('should strip Content-* fields, Transfer-Encoding field, and body', async () => {
      mockListener.mockImplementation((req, res) => {
        res.statusCode = 304;
        res.setHeader('Transfer-Encoding', 'chunked');
        res.send('foo');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(304);
      expect(res.headers.get('Content-Type')).toBe(null);
      expect(res.headers.get('Content-Length')).toBe(null);
      expect(res.headers.get('Transfer-Encoding')).toBe(null);
      expect(await res.text()).toBe('');
    });
  });

  // test('should always check regardless of length', async () => {
  //   const etag = '"asdf"';

  //   mockListener.mockImplementation((req, res) => {
  //     res.setHeader('ETag', etag);
  //     res.send('hey');
  //   });

  //   const res = await fetchWithProxyReq(url, {
  //     headers: { 'If-None-Match': etag },
  //   });
  //   expect(res.status).toBe(304);
  // });

  // test('should respond with 304 Not Modified when fresh', async () => {
  //   const etag = '"asdf"';

  //   mockListener.mockImplementation((req, res) => {
  //     res.setHeader('ETag', etag);
  //     res.send(Array(1000).join('-'));
  //   });

  //   const res = await fetchWithProxyReq(url, {
  //     headers: { 'If-None-Match': etag },
  //   });
  //   expect(res.status).toBe(304);
  // });

  // test('should not perform freshness check unless 2xx or 304', async () => {
  //   const etag = '"asdf"';

  //   mockListener.mockImplementation((req, res) => {
  //     res.status(500);
  //     res.setHeader('ETag', etag);
  //     res.send('hey');
  //   });

  //   const res = await fetchWithProxyReq(url, {
  //     headers: { 'If-None-Match': etag },
  //   });
  //   expect(res.status).toBe(500);
  //   expect(await res.text()).toBe('hey');
  // });

  describe('etag', () => {
    test('should send ETag', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send('kajdslfkasdf');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe('W/"c-IgR/L5SF7CJQff4wxKGF/vfPuZ0"');
    });

    test('should send ETag for empty string response', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send('');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe('W/"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"');
    });

    test('should send ETag for long response', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send(Array(1000).join('-'));
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe(
        'W/"3e7-qPnkJ3CVdVhFJQvUBfF10TmVA7g"'
      );
    });

    test('should not override ETag when manually set', async () => {
      mockListener.mockImplementation((req, res) => {
        res.setHeader('etag', '"asdf"');
        res.send('hello');
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe('"asdf"');
    });

    test('should not send ETag for res.send()', async () => {
      mockListener.mockImplementation((req, res) => {
        res.send();
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('ETag')).toBe(null);
    });
  });
});

// tests based on expressjs test suite
// see https://github.com/expressjs/express/blob/master/test/res.json.js
describe('res.json', () => {
  test('should send be chainable', async () => {
    const spy = jest.fn();

    mockListener.mockImplementation((req, res) => {
      spy(res, res.json({ hello: 'world' }));
    });

    await fetchWithProxyReq(url);

    const [a, b] = spy.mock.calls[0];
    expect(a).toBe(b);
  });

  test('res.json() should send an empty body', async () => {
    mockListener.mockImplementation((req, res) => {
      res.json();
    });

    await fetchWithProxyReq(url);

    const res = await fetchWithProxyReq(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(await res.text()).toBe('');
  });

  describe('.json(object)', () => {
    test('should not override previous Content-Types', async () => {
      mockListener.mockImplementation((req, res) => {
        res.setHeader('content-type', 'application/vnd.example+json');
        res.json({ hello: 'world' });
      });

      const res = await fetchWithProxyReq(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe(
        'application/vnd.example+json; charset=utf-8'
      );
      expect(await res.text()).toBe('{"hello":"world"}');
    });

    test('should set Content-Length and Content-Type', async () => {
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

    describe('when given primitives', () => {
      test('should respond with json for null', async () => {
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

      test('should respond with json for Number', async () => {
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

      test('should respond with json for String', async () => {
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
    });

    test('should respond with json when given an array', async () => {
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

    test('should respond with json when given an object', async () => {
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
  });
});

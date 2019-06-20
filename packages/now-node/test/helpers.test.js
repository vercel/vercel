/* global beforeEach, afterEach, expect, it, jest */
const fetch = require('node-fetch');
const listen = require('test-listen');
const qs = require('querystring');
const express = require('express');

const { createServerWithHelpers } = require('../dist/helpers');

const mockListener = jest.fn((req, res) => {
  res.send('hello');
});
const consumeEventMock = jest.fn(() => ({}));
const mockBridge = { consumeEvent: consumeEventMock };

let server;
let url;

const nowProps = [
  ['query', 0],
  ['cookies', 0],
  ['body', 0],
  ['status', 1],
  ['send', 1],
  ['json', 1],
];

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
  server = createServerWithHelpers(mockListener, mockBridge);
  url = await listen(server);
});

afterEach(async () => {
  await server.close();
});

it('should call consumeEvent with the correct reqId', async () => {
  await fetchWithProxyReq(`${url}/`);

  expect(consumeEventMock).toHaveBeenLastCalledWith('2');
});

it('should not expose the request id header', async () => {
  await fetchWithProxyReq(`${url}/`, { headers: { 'x-test-header': 'ok' } });

  const [{ headers }] = mockListener.mock.calls[0];

  expect(headers['x-now-bridge-request-id']).toBeUndefined();
  expect(headers['x-test-header']).toBe('ok');
});

it('req.query should reflect querystring in the url', async () => {
  await fetchWithProxyReq(`${url}/?who=bill&where=us`);

  expect(mockListener.mock.calls[0][0].query).toMatchObject({
    who: 'bill',
    where: 'us',
  });
});

it('req.query should be {} when there is no querystring', async () => {
  await fetchWithProxyReq(url);
  const [{ query }] = mockListener.mock.calls[0];
  expect(Object.keys(query).length).toBe(0);
});

it('req.cookies should reflect req.cookie header', async () => {
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

it('req.body should be undefined by default', async () => {
  await fetchWithProxyReq(url);
  expect(mockListener.mock.calls[0][0].body).toBe(undefined);
});

it('req.body should be undefined if content-type is not defined', async () => {
  await fetchWithProxyReq(url, {
    method: 'POST',
    body: 'hello',
  });
  expect(mockListener.mock.calls[0][0].body).toBe(undefined);
});

it('req.body should be a string when content-type is `text/plain`', async () => {
  await fetchWithProxyReq(url, {
    method: 'POST',
    body: 'hello',
    headers: { 'content-type': 'text/plain' },
  });

  expect(mockListener.mock.calls[0][0].body).toBe('hello');
});

it('req.body should be a buffer when content-type is `application/octet-stream`', async () => {
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

it('req.body should be an object when content-type is `application/x-www-form-urlencoded`', async () => {
  const obj = { who: 'mike' };

  await fetchWithProxyReq(url, {
    method: 'POST',
    body: qs.encode(obj),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });

  expect(mockListener.mock.calls[0][0].body).toMatchObject(obj);
});

it('req.body should be an object when content-type is `application/json`', async () => {
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

it('should throw error when body is empty and content-type is `application/json`', async () => {
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

it('should not recalculate req properties twice', async () => {
  const bodySpy = jest.fn(() => {});

  mockListener.mockImplementation((req, res) => {
    bodySpy(req.body, req.query, req.cookies);
    bodySpy(req.body, req.query, req.cookies);
    res.end();
  });

  await fetchWithProxyReq(`${url}/?who=bill`, {
    method: 'POST',
    body: JSON.stringify({ who: 'mike' }),
    headers: { 'content-type': 'application/json', cookie: 'who=jim' },
  });

  // here we test that bodySpy is called twice with exactly the same arguments
  for (let i = 0; i < 3; i += 1) {
    expect(bodySpy.mock.calls[0][i]).toBe(bodySpy.mock.calls[1][i]);
  }
});

it('should be able to overwrite req/res properties', async () => {
  const spy = jest.fn(() => {});

  mockListener.mockImplementation((...args) => {
    nowProps.forEach(([prop, n]) => {
      /* eslint-disable */
      args[n][prop] = 'ok';
      args[n][prop] = 'ok2';
      spy(args[n][prop]);
    });

    args[1].end();
  });

  await fetchWithProxyReq(url);

  nowProps.forEach((_, i) => expect(spy.mock.calls[i][0]).toBe('ok2'));
});

it('should be able to reconfig request properties', async () => {
  const spy = jest.fn(() => {});

  mockListener.mockImplementation((...args) => {
    nowProps.forEach(([prop, n]) => {
      // eslint-disable-next-line
      Object.defineProperty(args[n], prop, { value: 'ok', configurable: true });
      Object.defineProperty(args[n], prop, { value: 'ok2' });
      spy(args[n][prop]);
    });

    args[1].end();
  });

  await fetchWithProxyReq(url);

  nowProps.forEach((_, i) => expect(spy.mock.calls[i][0]).toBe('ok2'));
});

// specific test to test that express can overwrite our helpers
it('express should be able to override req and res helpers methods', async () => {
  const app = express();
  app.get('*', (req, res) => {
    res.send('hello world');
  });

  mockListener.mockImplementation(app);

  const res = await fetchWithProxyReq(url);
  const text = await res.text();

  expect(text).toMatch(/hello world/);
  expect(res.headers.get('content-type')).toMatch(/html/);
});

it('should be able to try/catch parse errors', async () => {
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

it('res.send() should send text', async () => {
  mockListener.mockImplementation((req, res) => {
    res.send('hello world');
  });

  const res = await fetchWithProxyReq(url);

  expect(await res.text()).toBe('hello world');
});

it('res.json() should send json', async () => {
  mockListener.mockImplementation((req, res) => {
    res.json({ who: 'bill' });
  });

  const res = await fetchWithProxyReq(url);
  const contentType = res.headers.get('content-type') || '';

  expect(contentType.includes('application/json')).toBe(true);
  expect(await res.json()).toMatchObject({ who: 'bill' });
});

it('res.status() should set the status code', async () => {
  mockListener.mockImplementation((req, res) => {
    res.status(404);
    res.end();
  });

  const res = await fetchWithProxyReq(url);

  expect(res.status).toBe(404);
});

it('res.status().send() should work', async () => {
  mockListener.mockImplementation((req, res) => {
    res.status(404).send('notfound');
  });

  const res = await fetchWithProxyReq(url);

  expect(res.status).toBe(404);
  expect(await res.text()).toBe('notfound');
});

it('res.status().json() should work', async () => {
  mockListener.mockImplementation((req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  const res = await fetchWithProxyReq(url);

  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ error: 'not found' });
});

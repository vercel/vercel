/* global beforeAll, beforeEach, afterAll, expect, it, jest */
const fetch = require('node-fetch');
const listen = require('test-listen');
const qs = require('querystring');

const { createServerWithHelpers } = require('../dist/helpers');

const mockListener = jest.fn((req, res) => {
  res.send('hello');
});
const consumeEventMock = jest.fn(() => ({}));
const mockBridge = { consumeEvent: consumeEventMock };

let server;
let url;

async function fetchWithProxyReq(_url, opts = {}) {
  consumeEventMock.mockImplementationOnce(() => opts);

  return fetch(_url, {
    ...opts,
    headers: { ...opts.headers, 'x-now-bridge-request-id': '2' },
  });
}

beforeAll(async () => {
  server = createServerWithHelpers(mockListener, mockBridge);
  url = await listen(server);
});

beforeEach(() => {
  mockListener.mockClear();
  consumeEventMock.mockClear();
});

afterAll(async () => {
  await server.close();
});

it('createServerWithHelpers should call consumeEvent with the correct reqId', async () => {
  await fetchWithProxyReq(`${url}/`);

  expect(consumeEventMock).toHaveBeenLastCalledWith('2');
});

it('should not expose the request id header', async () => {
  await fetchWithProxyReq(`${url}/`, { headers: { 'x-test-header': 'ok' } });

  const { headers } = mockListener.mock.calls[0][0];

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

it('req.body should contain the buffer', async () => {
  await fetchWithProxyReq(url, {
    method: 'POST',
    body: Buffer.from('hello'),
  });

  const { body } = mockListener.mock.calls[0][0];
  const str = body.toString();

  expect(str).toBe('hello');
});

it('req.body should contained the parsed object when content-type is application/x-www-form-urlencoded', async () => {
  const obj = { who: 'mike' };

  await fetchWithProxyReq(url, {
    method: 'POST',
    body: Buffer.from(qs.encode(obj)),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });

  expect(mockListener.mock.calls[0][0].body).toMatchObject(obj);
});

it('req.body should contained the parsed json when content-type is application/json', async () => {
  const json = {
    who: 'bill',
    where: 'us',
  };

  mockListener.mockImplementation((req, res) => {
    res.send('hello');
  });

  await fetchWithProxyReq(url, {
    method: 'POST',
    body: Buffer.from(JSON.stringify(json)),
    headers: { 'content-type': 'application/json' },
  });

  expect(mockListener.mock.calls[0][0].body).toMatchObject(json);
});

it('res.send() should send text', async () => {
  mockListener.mockImplementation((req, res) => {
    res.send('hello');
  });

  const res = await fetchWithProxyReq(url);

  expect(await res.text()).toBe('hello');
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

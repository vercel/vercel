/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { json, potentiallyLongRunningResponse } from '../src/response';

describe('json', () => {
  it('returns a response with JSON content', async () => {
    const content = { foo: 'bar' };
    const response = json(content);
    expect(response.headers.get('content-type')).toEqual('application/json');
    expect(await response.json()).toEqual(content);
  });

  it('can set response init', async () => {
    const content = { bar: 'baz' };
    const status = 201;
    const statusText = 'it is in';
    const customHeader = 'x-custom';
    const customHeaderValue = '1';
    const response = json(content, {
      status,
      statusText,
      headers: { [customHeader]: customHeaderValue },
    });
    expect(response).toMatchObject({
      status,
      statusText,
    });
    expect(response.headers.get('content-type')).toEqual('application/json');
    expect(response.headers.get(customHeader)).toEqual(customHeaderValue);
    expect(await response.json()).toEqual(content);
  });
});

describe('potentiallyLongRunningResponse', () => {
  it('returns a response with immediate data', async () => {
    const response = potentiallyLongRunningResponse(
      new Promise(resolve => resolve('test'))
    );
    expect(await response.text()).toBe('test');
  });

  it('returns a response after a timeout', async () => {
    const slowPromise: Promise<string> = new Promise(resolve =>
      setTimeout(() => resolve('after timeout'), 1000)
    );
    const response = potentiallyLongRunningResponse(slowPromise);
    expect(await response.text()).toBe('after timeout');
  });

  it('returns a response with custom init', async () => {
    const response = potentiallyLongRunningResponse(
      new Promise(resolve => resolve('test')),
      {
        status: 400,
        headers: {
          'content-type': 'text/custom',
        },
      }
    );
    expect(await response.text()).toBe('test');
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('text/custom');
  });

  it('returns a response with Uint8Array data', async () => {
    const data = new TextEncoder().encode('data');
    const response = potentiallyLongRunningResponse(
      new Promise(resolve => resolve(data))
    );
    expect(await response.text()).toBe('data');
  });

  it('returns ERROR on rejected promise', async () => {
    const response = potentiallyLongRunningResponse(
      new Promise((_, reject) => reject(new Error('test')))
    );
    expect(await response.text()).toBe('ERROR');
  });
});

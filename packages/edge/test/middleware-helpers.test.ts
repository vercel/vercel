/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { next, rewrite } from '../src/middleware-helpers';

describe('rewrite', () => {
  test('receives custom headers', () => {
    const resp = rewrite(new URL('https://example.vercel.sh/'), {
      headers: {
        'x-custom-header': 'custom-value',
      },
    });
    expect({
      status: resp.status,
      headers: Object.fromEntries(resp.headers),
    }).toMatchObject({
      status: 200,
      headers: {
        'x-custom-header': 'custom-value',
        'x-middleware-rewrite': 'https://example.vercel.sh/',
      },
    });
  });

  test('receives new request headers', () => {
    const headers = new Headers();
    headers.set('x-from-middleware1', 'hello1');
    headers.set('x-from-middleware2', 'hello2');
    const resp = rewrite(new URL('https://example.vercel.sh/'), {
      headers: {
        'x-custom-header': 'custom-value',
      },
      request: { headers },
    });
    expect({
      status: resp.status,
      headers: Object.fromEntries(resp.headers),
    }).toMatchObject({
      status: 200,
      headers: {
        'x-middleware-rewrite': 'https://example.vercel.sh/',
        'x-custom-header': 'custom-value',
        'x-middleware-override-headers':
          'x-from-middleware1,x-from-middleware2',
        'x-middleware-request-x-from-middleware2': 'hello2',
        'x-middleware-request-x-from-middleware1': 'hello1',
      },
    });
  });
});

describe('next', () => {
  test('receives custom headers', () => {
    const resp = next({
      headers: {
        'x-custom-header': 'custom-value',
      },
    });
    expect({
      status: resp.status,
      headers: Object.fromEntries(resp.headers),
    }).toMatchObject({
      status: 200,
      headers: {
        'x-custom-header': 'custom-value',
        'x-middleware-next': '1',
      },
    });
  });

  test('receives new request headers', () => {
    const headers = new Headers();
    headers.set('x-from-middleware1', 'hello1');
    headers.set('x-from-middleware2', 'hello2');
    const resp = next({
      headers: {
        'x-custom-header': 'custom-value',
      },
      request: { headers },
    });
    expect({
      status: resp.status,
      headers: Object.fromEntries(resp.headers),
    }).toMatchObject({
      status: 200,
      headers: {
        'x-middleware-next': '1',
        'x-custom-header': 'custom-value',
        'x-middleware-override-headers':
          'x-from-middleware1,x-from-middleware2',
        'x-middleware-request-x-from-middleware2': 'hello2',
        'x-middleware-request-x-from-middleware1': 'hello1',
      },
    });
  });
});

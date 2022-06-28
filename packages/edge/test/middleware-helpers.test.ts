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
});

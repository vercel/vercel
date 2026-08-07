import { describe, expect, it } from 'vitest';
import { Headers } from '../../../../src/util/fetch';
import { applyOverriddenHeaders } from '../../../../src/util/dev/headers';

describe('applyOverriddenHeaders', () => {
  it('do nothing if x-middleware-override-headers is not set', async () => {
    const reqHeaders = { a: '1' };
    const respHeaders = new Headers();

    applyOverriddenHeaders(reqHeaders, respHeaders);
    expect(reqHeaders).toStrictEqual({ a: '1' });
  });

  it('adds a new header', async () => {
    const reqHeaders = { a: '1' };
    const respHeaders = new Headers({
      // Define a new header 'b' and keep the existing header 'a'
      'x-middleware-override-headers': 'a,b',
      'x-middleware-request-a': '1',
      'x-middleware-request-b': '2',
    });

    const sanitizedHeaders = applyOverriddenHeaders(reqHeaders, respHeaders);
    expect(reqHeaders).toStrictEqual({ a: '1', b: '2' });
    expect(respHeaders.has('x-middleware-override-headers')).toBe(true);
    expect(respHeaders.has('x-middleware-request-a')).toBe(true);
    expect(respHeaders.has('x-middleware-request-b')).toBe(true);
    expect(sanitizedHeaders.has('x-middleware-override-headers')).toBe(false);
    expect(sanitizedHeaders.has('x-middleware-request-a')).toBe(false);
    expect(sanitizedHeaders.has('x-middleware-request-b')).toBe(false);
  });

  it('delete the header if x-middleware-request-* is undefined', async () => {
    const reqHeaders = { a: '1', b: '2' };
    const respHeaders = new Headers({
      // Deletes a new header 'c' and keep the existing headers `a` and `b`
      'x-middleware-override-headers': 'a,b,c',
      'x-middleware-request-a': '1',
      'x-middleware-request-b': '2',
    });

    applyOverriddenHeaders(reqHeaders, respHeaders);
    expect(reqHeaders).toStrictEqual({ a: '1', b: '2' });
  });

  it('updates an existing header', async () => {
    const reqHeaders = { a: '1', b: '2' };
    const respHeaders = new Headers({
      // Modifies the header 'b' and keep the existing header 'a'
      'x-middleware-override-headers': 'a,b',
      'x-middleware-request-a': '1',
      'x-middleware-request-b': 'modified',
    });

    applyOverriddenHeaders(reqHeaders, respHeaders);
    expect(reqHeaders).toStrictEqual({ a: '1', b: 'modified' });
  });

  it('ignores headers listed in NONOVERRIDABLE_HEADERS', async () => {
    const reqHeaders = { a: '1', host: 'example.com' };
    const respHeaders = new Headers({
      // Define a new header 'b' and 'content-length'
      'x-middleware-override-headers': 'a,b,content-length',
      'x-middleware-request-a': '1',
      'x-middleware-request-b': '2',
      'x-middleware-request-content-length': '128',
    });

    applyOverriddenHeaders(reqHeaders, respHeaders);
    expect(reqHeaders).toStrictEqual({ a: '1', b: '2', host: 'example.com' });
  });

  it('deletes an existing header', async () => {
    const reqHeaders = { a: '1', b: '2' };
    const respHeaders = new Headers({
      // Deletes the header 'a' and keep the existing header 'b'
      'x-middleware-override-headers': 'b',
      'x-middleware-request-b': '2',
    });

    applyOverriddenHeaders(reqHeaders, respHeaders);
    expect(reqHeaders).toStrictEqual({ b: '2' });
  });
});

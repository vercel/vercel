import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import nodeFetch from '../../../src/util/fetch';
import { listen } from 'async-listen';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createServer } from 'http';
import type { JSONValue } from '@vercel-internals/types';
import {
  responseError,
  responseErrorMessage,
  toEnumerableError,
} from '../../../src/util/error';

const send = (res: ServerResponse, statusCode: number, body: JSONValue) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf8');
  res.end(JSON.stringify(body));
};

describe('responseError()', () => {
  let url: string;
  let server: Server;
  let handler = (_req: IncomingMessage, _res: ServerResponse) => {};

  beforeAll(async () => {
    server = createServer((req, res) => handler(req, res));
    url = (await listen(server)).toString();
  });

  afterAll(
    () =>
      new Promise<void>(resolve => {
        server.close(() => resolve());
      })
  );

  it('should parse 4xx response error with fallback message', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 404, {});
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res, 'Failed to load data');
    expect(formatted.message).toEqual('Failed to load data (404)');
  });

  it('should parse 4xx response error without fallback message', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 404, {});
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res);
    expect(formatted.message).toEqual('Response Error (404)');
  });

  it('should parse 5xx response error without fallback message', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 500, '');
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res);
    expect(formatted.message).toEqual('Response Error (500)');
  });

  it('should parse 4xx response error as correct JSON', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 400, {
        error: {
          message: 'The request is not correct',
        },
      });
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res);
    expect(formatted.message).toEqual('The request is not correct (400)');
  });

  it('should parse 5xx response error as HTML', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 500, 'This is a malformed error');
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res, 'Failed to process data');
    expect(formatted.message).toEqual('Failed to process data (500)');
  });

  it('should parse 5xx response error with random JSON', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 500, {
        wrong: 'property',
      });
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res, 'Failed to process data');
    expect(formatted.message).toEqual('Failed to process data (500)');
  });

  it('should parse 4xx error message with broken JSON', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 403, `32puuuh2332`);
    };

    const res = await nodeFetch(url);
    const formatted = await responseErrorMessage(res, 'Not authenticated');
    expect(formatted).toEqual('Not authenticated (403)');
  });

  it('should parse 4xx error message with proper message', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 403, {
        error: {
          message: 'This is a test',
        },
      });
    };

    const res = await nodeFetch(url);
    const formatted = await responseErrorMessage(res);
    expect(formatted).toEqual('This is a test (403)');
  });

  it('should parse 5xx error message with proper message', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 500, {
        error: {
          message: 'This is a test',
        },
      });
    };

    const res = await nodeFetch(url);
    const formatted = await responseErrorMessage(res);
    expect(formatted).toEqual('Response Error (500)');
  });

  it('should parse 4xx response error with broken JSON', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 403, `122{"sss"`);
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res, 'Not authenticated');
    expect(formatted.message).toEqual('Not authenticated (403)');
  });

  it('should parse 4xx response error as correct JSON with more properties', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 403, {
        error: {
          message: 'The request is not correct',
          additionalProperty: 'test',
        },
      });
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res);
    expect(formatted.message).toEqual('The request is not correct (403)');
    expect(formatted.additionalProperty).toEqual('test');
  });

  it('should parse 429 response error with retry header', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Retry-After', '20');

      send(res, 429, {
        error: {
          message: 'You were rate limited',
        },
      });
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res);
    expect(formatted.message).toEqual('You were rate limited (429)');
    expect(formatted.retryAfterMs).toEqual(20000);
  });

  it('should parse 429 response error without retry header', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 429, {
        error: {
          message: 'You were rate limited',
        },
      });
    };

    const res = await nodeFetch(url);
    const formatted = await responseError(res);
    expect(formatted.message).toEqual('You were rate limited (429)');
    // We default to 0 in this case so callers still know to retry
    expect(formatted.retryAfterMs).toEqual(0);
  });
});

describe('toEnumerableError()', () => {
  it('should JSON stringify Error', () => {
    const err = new Error('An error');
    const enumerable = toEnumerableError(err);
    expect(JSON.stringify(err)).toEqual('{}');

    // Delete `stack` since it makes stringify nondeterministic
    // (due to filenames / line numbers)
    expect(typeof enumerable.stack).toEqual('string');
    delete enumerable.stack;

    expect(JSON.stringify(enumerable)).toEqual(
      '{"name":"Error","message":"An error"}'
    );
  });

  it('should JSON stringify Error with custom properties', () => {
    const err = new Error('An error');
    Object.defineProperty(err, 'custom', {
      enumerable: false,
      value: 'value',
    });
    Object.defineProperty(err, 'userError', {
      enumerable: false,
      value: true,
    });
    const enumerable = toEnumerableError(err);
    expect(JSON.stringify(err)).toEqual('{}');

    // Delete `stack` since it makes stringify undeterministinc
    // (due to filenames / line numbers)
    expect(typeof enumerable.stack).toEqual('string');
    delete enumerable.stack;

    expect(JSON.stringify(enumerable)).toEqual(
      '{"name":"Error","message":"An error","custom":"value","userError":true}'
    );
  });

  it('serializes a cause with circular class instances without throwing', () => {
    // Shape of vlt's "Integrity check failure": the cause carries the useful
    // fields plus objects (like a path-scurry PathPosix) with circular refs.
    class PathPosix {
      root: PathPosix;
      constructor() {
        this.root = this;
      }
    }
    const err = new Error('Integrity check failure', {
      cause: {
        code: 'EINTEGRITY',
        url: 'https://example.vercel.sh/tarballs/vercel-static-build.tgz',
        wanted: 'sha512-wanted',
        found: 'sha512-found',
        response: { path: new PathPosix(), statusCode: 200 },
      },
    });
    const selfReferencing = { name: 'self' } as Record<string, unknown>;
    selfReferencing.self = selfReferencing;
    Object.defineProperty(err, 'extra', { value: selfReferencing });

    const enumerable = toEnumerableError(err);
    delete enumerable.stack;
    const json = JSON.parse(JSON.stringify(enumerable));

    expect(json.message).toBe('Integrity check failure');
    expect(json.cause).toMatchObject({
      code: 'EINTEGRITY',
      url: 'https://example.vercel.sh/tarballs/vercel-static-build.tgz',
      wanted: 'sha512-wanted',
      found: 'sha512-found',
      response: { path: '[PathPosix]', statusCode: 200 },
    });
    expect(json.extra).toEqual({ name: 'self', self: '[Circular]' });
  });

  it.each([
    ['a string', 'boom', 'boom'],
    ['a number', 42, '42'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
  ])('serializes %s thrown value without throwing', (_label, thrown, message) => {
    const enumerable = toEnumerableError(thrown as unknown as Partial<Error>);

    expect(JSON.parse(JSON.stringify(enumerable))).toEqual({
      name: 'Error',
      message,
    });
  });

  it('serializes a non-Error thrown object', () => {
    const json = JSON.parse(
      JSON.stringify(
        toEnumerableError({ message: 'plain object', code: 'E_PLAIN' })
      )
    );

    expect(json).toMatchObject({ message: 'plain object', code: 'E_PLAIN' });
  });

  it('serializes nested Error causes recursively', () => {
    const err = new Error('outer', { cause: new Error('inner') });

    const json = JSON.parse(JSON.stringify(toEnumerableError(err)));

    expect(json.cause).toMatchObject({ name: 'Error', message: 'inner' });
    expect(typeof json.cause.stack).toBe('string');
  });
});

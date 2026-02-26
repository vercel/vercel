import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let handler = (_req: IncomingMessage, _res: ServerResponse) => {};

  beforeAll(async () => {
    server = createServer((req, res) => handler(req, res));
    url = (await listen(server)).toString();
  });

  afterAll(() => {
    server.close();
  });

  it('should parse 4xx response error with fallback message', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 404, {});
    };

    const res = await fetch(url);
    const formatted = await responseError(res, 'Failed to load data');
    expect(formatted.message).toEqual('Failed to load data (404)');
  });

  it('should parse 4xx response error without fallback message', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 404, {});
    };

    const res = await fetch(url);
    const formatted = await responseError(res);
    expect(formatted.message).toEqual('Response Error (404)');
  });

  it('should parse 5xx response error without fallback message', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 500, '');
    };

    const res = await fetch(url);
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

    const res = await fetch(url);
    const formatted = await responseError(res);
    expect(formatted.message).toEqual('The request is not correct (400)');
  });

  it('should parse 5xx response error as HTML', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 500, 'This is a malformed error');
    };

    const res = await fetch(url);
    const formatted = await responseError(res, 'Failed to process data');
    expect(formatted.message).toEqual('Failed to process data (500)');
  });

  it('should parse 5xx response error with random JSON', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 500, {
        wrong: 'property',
      });
    };

    const res = await fetch(url);
    const formatted = await responseError(res, 'Failed to process data');
    expect(formatted.message).toEqual('Failed to process data (500)');
  });

  it('should parse 4xx error message with broken JSON', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 403, `32puuuh2332`);
    };

    const res = await fetch(url);
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

    const res = await fetch(url);
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

    const res = await fetch(url);
    const formatted = await responseErrorMessage(res);
    expect(formatted).toEqual('Response Error (500)');
  });

  it('should parse 4xx response error with broken JSON', async () => {
    handler = (_req: IncomingMessage, res: ServerResponse) => {
      send(res, 403, `122{"sss"`);
    };

    const res = await fetch(url);
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

    const res = await fetch(url);
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

    const res = await fetch(url);
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

    const res = await fetch(url);
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
});

import { afterEach, describe, test, expect, vi } from 'vitest';
import { Headers, Response, Request } from 'node-fetch';
import {
  getUrl,
  registerFetchListener,
  respond,
  toResponseError,
} from '../../../src/edge-functions/edge-handler-template.js';

const originalAddEventListener = globalThis.addEventListener;

afterEach(() => {
  globalThis.addEventListener = originalAddEventListener;
});

function createFetchEvent(method = 'GET') {
  let response!: Response;
  const event = {
    request: new Request('https://127.0.0.1/api/test', {
      method,
      headers: {
        'x-forwarded-host': 'example.com',
        'x-forwarded-port': '',
        'x-forwarded-proto': 'https',
      },
    }),
    waitUntil: vi.fn(),
    respondWith(value: Response | Promise<Response>) {
      response = undefined as any;
      Promise.resolve(value).then(result => {
        response = result;
      });
    },
  };
  return { event, response: () => response };
}

async function invokeRegisteredHandler(module: object, method = 'GET') {
  let listener!: (event: unknown) => Promise<void>;
  globalThis.addEventListener = vi.fn((_type, handler) => {
    listener = handler as typeof listener;
  }) as any;
  registerFetchListener(
    module,
    { isMiddleware: false, entrypointLabel: 'api/test.js' },
    { Request, Response }
  );
  const fixture = createFetchEvent(method);
  await listener(fixture.event);
  await Promise.resolve();
  return { ...fixture, response: fixture.response() };
}

describe('edge-handler-template', () => {
  describe('getUrl()', () => {
    test('single `x-forwarded-proto` value', async () => {
      expect(
        getUrl(
          'http://127.0.0.1:51126/api/add',
          new Headers({
            'x-forwarded-port': '',
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'somewhere.com',
          })
        )
      ).toBe('https://somewhere.com/api/add');
    });

    test('multiple `x-forwarded-proto` value', async () => {
      expect(
        getUrl(
          'https://127.0.0.1:51126/api/add',
          new Headers({
            'x-forwarded-port': '',
            'x-forwarded-proto': 'https,http',
            'x-forwarded-host': 'somewhere.com',
          })
        )
      ).toBe('https://somewhere.com/api/add');
    });

    test('keep the path as part of the URL', async () => {
      expect(
        getUrl(
          'https://127.0.0.1:51126/',
          new Headers({
            'x-forwarded-port': '',
            'x-forwarded-proto': 'https,http',
            'x-forwarded-host': 'somewhere.com',
          })
        )
      ).toBe('https://somewhere.com/');
    });

    test('respect `x-forwarded-host` with no `x-forwarded-proto`', async () => {
      expect(
        getUrl(
          'https://127.0.0.1:51126/api/add',
          new Headers({
            'x-forwarded-host': 'somewhere.com',
            'x-forwarded-port': '',
          })
        )
      ).toBe('https://somewhere.com/api/add');
    });
  });

  describe('respond()', () => {
    test("don't expose internal proxy details", async () => {
      function userEdgeHandler(req: Request) {
        return new Response(`hello from: ${req.url}`);
      }

      const event = {
        request: new Request('http://127.0.0.1:60705/api/add', {
          headers: {
            accept: '*/*',
            'accept-encoding': 'gzip,deflate',
            connection: 'close',
            host: '127.0.0.1:60705',
            'user-agent': 'curl/7.86.0',
            'x-forwarded-for': '::ffff:127.0.0.1',
            'x-forwarded-host': 'somewhere.com',
            'x-forwarded-port': '',
            'x-forwarded-proto': 'https,http',
            'x-real-ip': '::ffff:127.0.0.1',
            'x-vercel-deployment-url': 'localhost:1337',
            'x-vercel-forwarded-for': '::ffff:127.0.0.1',
            'x-vercel-id': 'dev1::dev1::iaq68-1681934030421-110d3964f516',
          },
        }),
      };

      const isMiddleware = false;
      const entrypointLabel = 'api/add.js';
      const response = await respond(
        userEdgeHandler,
        event,
        {
          isMiddleware,
          entrypointLabel,
        },
        {
          Request,
          Response,
        }
      );

      expect(await response.text()).toBe(
        'hello from: https://somewhere.com/api/add'
      );
    });
  });

  describe('failure and dispatch behavior', () => {
    test('middleware handlers without a response pass through', async () => {
      const event = createFetchEvent().event;

      const response = await respond(
        () => undefined,
        event,
        { isMiddleware: true, entrypointLabel: 'middleware.js' },
        { Request, Response }
      );

      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    test('non-middleware handlers must return a response', async () => {
      const event = createFetchEvent().event;

      await expect(
        respond(
          () => undefined,
          event,
          { isMiddleware: false, entrypointLabel: 'api/test.js' },
          { Request, Response }
        )
      ).rejects.toThrow('Edge Function did not return a response.');
    });

    test('dispatches named methods and returns 405 for missing methods', async () => {
      const module = {
        POST: () => new Response('posted'),
      };

      const posted = await invokeRegisteredHandler(module, 'POST');
      expect(posted.response.status).toBe(200);
      expect(await posted.response.text()).toBe('posted');

      const missing = await invokeRegisteredHandler(module, 'GET');
      expect(missing.response.status).toBe(405);
    });

    test('formats missing exports and nested causes as wrapper failures', async () => {
      const missing = await invokeRegisteredHandler({}, 'GET');
      expect(missing.response.status).toBe(500);
      expect(missing.response.headers.get('x-vercel-failed')).toBe(
        'edge-wrapper'
      );
      expect(await missing.response.text()).toContain(
        'No default or HTTP-named export was found at https://example.com/api/test'
      );

      const error = new Error('outer', { cause: new Error('inner') });
      const response = toResponseError(error, Response);
      expect(await response.text()).toBe('outer: inner');
      expect(response.headers.get('x-vercel-failed')).toBe('edge-wrapper');
    });

    test('forwards waitUntil through the named-handler context', async () => {
      const work = Promise.resolve();
      const fixture = await invokeRegisteredHandler(
        {
          GET: (
            _request: Request,
            context: { waitUntil(value: Promise<void>): void }
          ) => {
            context.waitUntil(work);
            return new Response('ok');
          },
        },
        'GET'
      );

      expect(fixture.event.waitUntil).toHaveBeenCalledWith(work);
    });
  });
});

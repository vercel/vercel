import { describe, test, expect } from 'vitest';
import {
  getUrl,
  respond,
} from '../../../src/edge-functions/edge-handler-template.js';

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
});

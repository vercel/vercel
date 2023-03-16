import { Response, Request } from 'node-fetch';
import {
  buildUrl,
  respond,
  // @ts-ignore - this is a special patch file to allow importing from the template
} from '../../../src/edge-functions/edge-handler-template.js';

describe('edge-handler-template', () => {
  describe('buildUrl()', () => {
    test('works with basic proto', async () => {
      const url = buildUrl({
        url: '/api/add',
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'somewhere.com',
        },
      });
      expect(url).toBe('https://somewhere.com/api/add');
    });

    test('works with multi proto', async () => {
      const url = buildUrl({
        url: '/api/add',
        headers: {
          'x-forwarded-proto': 'https,http',
          'x-forwarded-host': 'somewhere.com',
        },
      });
      expect(url).toBe('https://somewhere.com/api/add');
    });
  });

  describe('respond()', () => {
    test('works', async () => {
      const request = {
        url: '/api/add',
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'somewhere.com',
        },
      };

      function userEdgeHandler(req: Request) {
        return new Response(`hello from: ${req.url}`);
      }

      const event = {};
      const isMiddleware = false;
      const entrypointLabel = 'api/add.js';
      const response = await respond(
        userEdgeHandler,
        request,
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

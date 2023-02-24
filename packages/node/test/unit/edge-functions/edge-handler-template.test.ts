import { Response, Request } from 'node-fetch';
// @ts-ignore - this is a special patch file to allow importing from the template
import { buildUrl, respond } from './edge-handler-template-export';

describe('edge-handler-template', () => {
  describe('buildUrl()', () => {
    test('works with basic proto', async () => {
      const url = buildUrl({
        url: '/over',
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'somewhere.com',
        },
      });
      expect(url).toBe('https://somewhere.com/over');
    });
  });

  describe('respond()', () => {
    test('works', async () => {
      const request = {
        url: '/over',
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'somewhere.com',
        },
      };

      function userEdgeHandler(req: Request) {
        return new Response(`hello from: ${req.url}`);
      }

      const event = {};
      const response = await respond(userEdgeHandler, request, event);
      expect(await response.text()).toBe(
        'hello from: https://somewhere.com/over'
      );
    });
  });
});

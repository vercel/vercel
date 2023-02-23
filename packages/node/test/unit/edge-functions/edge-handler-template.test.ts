const { buildUrl, respond } = require('./edge-handler-template-export');

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
      const event = {};
      // const isMiddleware = false;
      // const entrypointLabel = '';

      const response = respond(request, event);
      expect(response.url).toBe('https://somewhere.com/over');
      expect(response.headers).toContain({
        'x-middleware-next': '1',
      });
    });
  });
});

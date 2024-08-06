/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ctx = {};

function findActionId(page) {
  page = `app${page}/page`; // add /app prefix and /page suffix

  for (const [actionId, details] of Object.entries(ctx.actionManifest.node)) {
    if (details.workers[page]) {
      return actionId;
    }
  }
  return null;
}

function generateFormDataPayload(actionId) {
  return {
    method: 'POST',
    body: `------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name=\"1_$ACTION_ID_${actionId}\"\r\n\r\n\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name=\"0\"\r\n\r\n[\"$K1\"]\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ--\r\n`,
    headers: {
      'Content-Type':
        'multipart/form-data; boundary=----WebKitFormBoundaryHcVuFa30AN0QV3uZ',
      'Next-Action': actionId,
    },
  };
}

describe(`${__dirname.split(path.sep).pop()}`, () => {
  beforeAll(async () => {
    const info = await deployAndTest(__dirname);

    const actionManifest = await fetch(
      `${info.deploymentUrl}/server-reference-manifest.json`
    ).then(res => res.json());

    ctx.actionManifest = actionManifest;

    Object.assign(ctx, info);
  });

  describe('client component', () => {
    it('should bypass the static cache for a server action', async () => {
      const path = '/client/static';
      const actionId = findActionId(path);

      const res = await fetch(`${ctx.deploymentUrl}${path}`, {
        method: 'POST',
        body: JSON.stringify([1337]),
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'Next-Action': actionId,
        },
      });

      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body).toContain('1338');
      expect(res.headers.get('x-matched-path')).toBe(path);
      expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');
    });

    it('should bypass the static cache for a server action on a page with dynamic params', async () => {
      const path = '/client/static/[dynamic-static]';
      const actionId = findActionId(path);

      const res = await fetch(`${ctx.deploymentUrl}${path}`, {
        method: 'POST',
        body: JSON.stringify([1337]),
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'Next-Action': actionId,
        },
      });

      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body).toContain('1338');
      expect(res.headers.get('x-matched-path')).toBe(path);
      expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');
    });

    it('should bypass the static cache for a multipart request (no action header)', async () => {
      const path = '/client/static';
      const actionId = findActionId(path);

      const res = await fetch(`${ctx.deploymentUrl}${path}`, {
        method: 'POST',
        body: `------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name=\"1_$ACTION_ID_${actionId}\"\r\n\r\n\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name=\"0\"\r\n\r\n[\"$K1\"]\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ--\r\n`,
        headers: {
          'Content-Type':
            'multipart/form-data; boundary=----WebKitFormBoundaryHcVuFa30AN0QV3uZ',
        },
      });

      expect(res.status).toEqual(200);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');
      expect(res.headers.get('x-matched-path')).toBe(path);
    });

    it('should properly invoke the action on a dynamic page', async () => {
      const path = '/client/dynamic/[id]';
      const actionId = findActionId(path);

      const res = await fetch(`${ctx.deploymentUrl}${path}`, {
        method: 'POST',
        body: JSON.stringify([1337]),
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'Next-Action': actionId,
        },
      });

      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body).toContain('1338');
      expect(res.headers.get('x-matched-path')).toBe(path);
      // This isn't a "BYPASS" because the action wasn't part of a static prerender
      expect(res.headers.get('x-vercel-cache')).toBe('MISS');
    });
  });

  describe('server component', () => {
    it('should bypass the static cache for a server action', async () => {
      const path = '/rsc/static';
      const actionId = findActionId(path);

      const res = await fetch(
        `${ctx.deploymentUrl}${path}`,
        generateFormDataPayload(actionId)
      );

      expect(res.status).toEqual(200);
      expect(res.headers.get('x-matched-path')).toBe(path);
      expect(res.headers.get('content-type')).toBe('text/x-component');
      expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');
    });

    it('should bypass the static cache for a server action on a page with dynamic params', async () => {
      const path = '/rsc/static/[dynamic-static]';
      const actionId = findActionId(path);

      const res = await fetch(
        `${ctx.deploymentUrl}${path}`,
        generateFormDataPayload(actionId)
      );

      expect(res.status).toEqual(200);
      expect(res.headers.get('x-matched-path')).toBe(path);
      expect(res.headers.get('content-type')).toBe('text/x-component');
      expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');
    });

    it('should properly invoke the action on a dynamic page', async () => {
      const path = '/rsc/dynamic';
      const actionId = findActionId(path);

      const res = await fetch(
        `${ctx.deploymentUrl}${path}`,
        generateFormDataPayload(actionId)
      );

      expect(res.status).toEqual(200);
      expect(res.headers.get('x-matched-path')).toBe(path);
      expect(res.headers.get('content-type')).toBe('text/x-component');
      // This isn't a "BYPASS" because the action wasn't part of a static prerender
      expect(res.headers.get('x-vercel-cache')).toBe('MISS');
    });

    describe('generateStaticParams', () => {
      it('should bypass the static cache for a server action when pre-generated', async () => {
        const path = '/rsc/static/generate-static-params/pre-generated';
        const actionId = findActionId(
          '/rsc/static/generate-static-params/[slug]'
        );

        const res = await fetch(
          `${ctx.deploymentUrl}${path}`,
          generateFormDataPayload(actionId)
        );

        expect(res.status).toEqual(200);
        expect(res.headers.get('x-matched-path')).toBe(
          '/rsc/static/generate-static-params/pre-generated'
        );
        expect(res.headers.get('content-type')).toBe('text/x-component');
        expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');
      });

      it('should bypass the static cache for a server action when not pre-generated', async () => {
        const page = '/rsc/static/generate-static-params/[slug]';
        const actionId = findActionId(page);

        const res = await fetch(
          `${ctx.deploymentUrl}/rsc/static/generate-static-params/not-pre-generated`,
          generateFormDataPayload(actionId)
        );

        expect(res.status).toEqual(200);
        expect(res.headers.get('x-matched-path')).toBe(page);
        expect(res.headers.get('content-type')).toBe('text/x-component');
        // This isn't a "BYPASS" because the action wasn't part of a static prerender
        expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');
      });
    });
  });

  describe('pages', () => {
    it('should not attempt to rewrite the action path for a server action (POST)', async () => {
      const res = await fetch(`${ctx.deploymentUrl}/api/test`, {
        method: 'POST',
        headers: {
          'Content-Type':
            'multipart/form-data; boundary=----WebKitFormBoundaryHcVuFa30AN0QV3uZ',
        },
      });

      expect(res.status).toEqual(200);
      expect(res.headers.get('x-matched-path')).toBe('/api/test');
      expect(res.headers.get('x-vercel-cache')).toBe('MISS');
      const body = await res.json();
      expect(body).toEqual({ message: 'Hello from Next.js!' });
    });

    it('should not attempt to rewrite the action path for a server action (GET)', async () => {
      const res = await fetch(`${ctx.deploymentUrl}/api/test`);

      expect(res.status).toEqual(200);
      expect(res.headers.get('x-matched-path')).toBe('/api/test');
      const body = await res.json();
      expect(body).toEqual({ message: 'Hello from Next.js!' });
    });
  });
});

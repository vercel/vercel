/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ctx = {};

function findActionId(page, runtime) {
  page = `app${page}/page`; // add /app prefix and /page suffix

  for (const [actionId, details] of Object.entries(
    ctx.actionManifest[runtime]
  )) {
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

  describe.each(['node', 'edge'])('runtime: %s', runtime => {
    const basePath = runtime === 'edge' ? '/edge' : '';
    describe('client component', () => {
      it('should bypass the static cache for a server action', async () => {
        const path = `${basePath}/client/static`;
        const actionId = findActionId(path, runtime);

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
        expect(res.headers.get('x-matched-path')).toBe(path + '.action');
        if (runtime === 'node') {
          expect(res.headers.get('x-vercel-cache')).toBe('MISS');
        } else {
          // in edge runtime, x-vercel-cache is not returned on MISSes for some reason.
          // this checks to ensure it was routed to the edge function instead.
          expect(res.headers.get('x-edge-runtime')).toBe('1');
        }
      });

      it('should bypass the static cache for a server action on a page with dynamic params', async () => {
        const path = `${basePath}/client/static/[dynamic-static]`;
        const actionId = findActionId(path, runtime);

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
        expect(res.headers.get('x-matched-path')).toBe(path + '.action');
        if (runtime === 'node') {
          expect(res.headers.get('x-vercel-cache')).toBe('MISS');
        } else {
          expect(res.headers.get('x-edge-runtime')).toBe('1');
        }
      });

      it('should bypass the static cache for a multipart request (no action header)', async () => {
        const path = `${basePath}/client/static`;
        const actionId = findActionId(path, runtime);

        const res = await fetch(`${ctx.deploymentUrl}${path}`, {
          method: 'POST',
          body: `------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name=\"1_$ACTION_ID_${actionId}\"\r\n\r\n\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ\r\nContent-Disposition: form-data; name=\"0\"\r\n\r\n[\"$K1\"]\r\n------WebKitFormBoundaryHcVuFa30AN0QV3uZ--\r\n`,
          headers: {
            'Content-Type':
              'multipart/form-data; boundary=----WebKitFormBoundaryHcVuFa30AN0QV3uZ',
          },
        });

        expect(res.status).toEqual(200);
        expect(res.headers.get('content-type')).toBe(
          'text/html; charset=utf-8'
        );
        if (runtime === 'node') {
          // This is a "BYPASS" because no action ID was provided, so it'll fall back to
          // `experimentalBypassFor` handling.
          expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');
        } else {
          expect(res.headers.get('x-edge-runtime')).toBe('1');
        }
        expect(res.headers.get('x-matched-path')).toBe(path);
      });

      it('should properly invoke the action on a dynamic page', async () => {
        const path = `${basePath}/client/dynamic/[id]`;
        const actionId = findActionId(path, runtime);

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
        expect(res.headers.get('x-matched-path')).toBe(path + '.action');
        if (runtime === 'node') {
          expect(res.headers.get('x-vercel-cache')).toBe('MISS');
        } else {
          expect(res.headers.get('x-edge-runtime')).toBe('1');
        }
      });
    });

    describe('server component', () => {
      it('should bypass the static cache for a server action', async () => {
        const path = `${basePath}/rsc/static`;
        const actionId = findActionId(path, runtime);

        const res = await fetch(
          `${ctx.deploymentUrl}${path}`,
          generateFormDataPayload(actionId)
        );

        expect(res.status).toEqual(200);
        expect(res.headers.get('x-matched-path')).toBe(path + '.action');
        expect(res.headers.get('content-type')).toBe('text/x-component');
        if (runtime === 'node') {
          expect(res.headers.get('x-vercel-cache')).toBe('MISS');
        } else {
          expect(res.headers.get('x-edge-runtime')).toBe('1');
        }
      });

      it('should bypass the static cache for a server action on a page with dynamic params', async () => {
        const path = `${basePath}/rsc/static/[dynamic-static]`;
        const actionId = findActionId(path, runtime);

        const res = await fetch(
          `${ctx.deploymentUrl}${path}`,
          generateFormDataPayload(actionId)
        );

        expect(res.status).toEqual(200);
        expect(res.headers.get('x-matched-path')).toBe(path + '.action');
        expect(res.headers.get('content-type')).toBe('text/x-component');
        if (runtime === 'node') {
          expect(res.headers.get('x-vercel-cache')).toBe('MISS');
        } else {
          expect(res.headers.get('x-edge-runtime')).toBe('1');
        }
      });

      it('should properly invoke the action on a dynamic page', async () => {
        const path = `${basePath}/rsc/dynamic`;
        const actionId = findActionId(path, runtime);

        const res = await fetch(
          `${ctx.deploymentUrl}${path}`,
          generateFormDataPayload(actionId)
        );

        expect(res.status).toEqual(200);
        expect(res.headers.get('x-matched-path')).toBe(path + '.action');
        expect(res.headers.get('content-type')).toBe('text/x-component');
        if (runtime === 'node') {
          expect(res.headers.get('x-vercel-cache')).toBe('MISS');
        } else {
          expect(res.headers.get('x-edge-runtime')).toBe('1');
        }
      });

      describe('generateStaticParams', () => {
        it('should bypass the static cache for a server action when pre-generated', async () => {
          const path = `${basePath}/rsc/static/generate-static-params/pre-generated`;
          const dynamicPath = `${basePath}/rsc/static/generate-static-params/[slug]`;
          const actionId = findActionId(dynamicPath, runtime);

          const res = await fetch(
            `${ctx.deploymentUrl}${path}`,
            generateFormDataPayload(actionId)
          );

          expect(res.status).toEqual(200);
          expect(res.headers.get('x-matched-path')).toBe(
            dynamicPath + '.action'
          );
          expect(res.headers.get('content-type')).toBe('text/x-component');
          if (runtime === 'node') {
            expect(res.headers.get('x-vercel-cache')).toBe('MISS');
          } else {
            expect(res.headers.get('x-edge-runtime')).toBe('1');
          }
        });

        it('should bypass the static cache for a server action when not pre-generated', async () => {
          const page = `${basePath}/rsc/static/generate-static-params/[slug]`;
          const actionId = findActionId(page, runtime);

          const res = await fetch(
            `${ctx.deploymentUrl}/${basePath}/rsc/static/generate-static-params/not-pre-generated`,
            generateFormDataPayload(actionId)
          );

          expect(res.status).toEqual(200);
          expect(res.headers.get('x-matched-path')).toBe(page + '.action');
          expect(res.headers.get('content-type')).toBe('text/x-component');
          if (runtime === 'node') {
            expect(res.headers.get('x-vercel-cache')).toBe('MISS');
          } else {
            expect(res.headers.get('x-edge-runtime')).toBe('1');
          }
        });
      });
    });

    it('should not match to an action output when the RSC header is present', async () => {
      const canonicalPath = `${basePath}/client/dynamic/1`;
      const pagePath = `${basePath}/client/dynamic/[id]`;
      const actionId = findActionId(pagePath, runtime);

      const res = await fetch(`${ctx.deploymentUrl}${canonicalPath}`, {
        method: 'POST',
        body: JSON.stringify([1337]),
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'Next-Action': actionId,
          'Next-Response': 'rsc',
          RSC: '1',
        },
      });

      expect(res.status).toEqual(200);
      expect(res.headers.get('x-matched-path')).toBe(pagePath + '.rsc');
      expect(res.headers.get('content-type')).toBe('text/x-component');
      const body = await res.text();
      expect(body).toContain(JSON.stringify(['id', '1', 'd']));
      expect(body).not.toContain(JSON.stringify(['id', '1.action', 'd']));
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

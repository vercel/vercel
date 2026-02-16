import fs from 'fs-extra';
import { join } from 'path';
import {
  fetch,
  fixture,
  testFixture,
  testFixtureStdio,
  validateResponseHeaders,
} from './utils';

test(
  '[vercel dev] 25-nextjs-src-dir',
  testFixtureStdio('25-nextjs-src-dir', async (testPath: any) => {
    await testPath(200, '/', /Next.js \+ Node.js API/m);
  })
);

test(
  '[vercel dev] 27-zero-config-env',
  testFixtureStdio(
    '27-zero-config-env',
    async (testPath: any) => {
      await testPath(200, '/api/print', /build-and-runtime/m);
      await testPath(200, '/', /build-and-runtime/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 28-vercel-json-and-ignore',
  testFixtureStdio('28-vercel-json-and-ignore', async (testPath: any) => {
    await testPath(200, '/api/one', 'One');
    await testPath(404, '/api/two');
    await testPath(200, '/api/three', 'One');
  })
);

test(
  '[vercel dev] 30-next-image-optimization',
  testFixtureStdio('30-next-image-optimization', async (testPath: any) => {
    const toUrl = (url: any, w: any, q: any) => {
      // @ts-ignore
      const query = new URLSearchParams();
      query.append('url', url);
      query.append('w', w);
      query.append('q', q);
      return `/_next/image?${query}`;
    };

    const expectHeader = (accept: any) => ({
      'content-type': accept,
      'cache-control': 'public, max-age=0, must-revalidate',
    });
    const fetchOpts = (accept: any) => ({ method: 'GET', headers: { accept } });
    await testPath(200, '/', /Home Page/m);
    await testPath(
      200,
      toUrl('/test.jpg', 64, 100),
      null,
      expectHeader('image/webp'),
      fetchOpts('image/webp')
    );
    await testPath(
      200,
      toUrl('/test.png', 64, 90),
      null,
      expectHeader('image/webp'),
      fetchOpts('image/webp')
    );
    /*
     * Disabled gif in https://github.com/vercel/next.js/pull/22253
     * Eventually we should enable again when `next dev` supports it
    await testPath(
      200,
      toUrl('/test.gif', 64, 80),
      null,
      expectHeader('image/webp'),
      fetchOpts('image/webp')
    );
    */
    /*
     * Disabled svg in https://github.com/vercel/next.js/pull/34431
     * We can test for 400 status since config option is not enabled.
     */
    await testPath(400, toUrl('/test.svg', 64, 70));
    /* Disabled bmp because `next dev` bypasses
     * and production will convert. Eventually
     * we can enable once `next dev` supports it.
    await testPath(
      200,
      toUrl('/test.bmp', 64, 50),
      null,
      expectHeader('image/bmp'),
      fetchOpts('image/webp')
    );
    */
    // animated gif should bypass: serve as-is
    await testPath(
      200,
      toUrl('/animated.gif', 64, 60),
      null,
      expectHeader('image/gif'),
      fetchOpts('image/webp')
    );
  })
);

// Skipping because it doesn't run yet on Node 22
// eslint-disable-next-line jest/no-disabled-tests
test.skip(
  '[vercel dev] 40-mixed-modules',
  testFixtureStdio('40-mixed-modules', async (testPath: any) => {
    await testPath(200, '/entrypoint.js', 'mixed-modules:js');
    await testPath(200, '/entrypoint.mjs', 'mixed-modules:mjs');
    await testPath(200, '/entrypoint.ts', 'mixed-modules:ts');
    await testPath(
      200,
      '/type-module-package-json/auto.js',
      'mixed-modules:auto'
    );
    await testPath(
      200,
      '/type-module-package-json/nested/also.js',
      'mixed-modules:also'
    );
  })
);

test(
  '[vercel dev] 41-tsconfig-jsx',
  testFixtureStdio('41-tsconfig-jsx', async (testPath: any) => {
    await testPath(200, '/', /Solid App/m);
    await testPath(200, '/api/test', 'working');
  })
);

test(
  '[vercel dev] 42-dynamic-esm-ext',
  testFixtureStdio('42-dynamic-esm-ext', async (testPath: any) => {
    await testPath(200, '/api/cjs/foo', 'found .js');
    await testPath(200, '/api/esm/foo', 'found .mjs');
  })
);

test(
  '[vercel dev] 43-compress-encoding',
  testFixtureStdio('43-compress-encoding', async (testPath: any) => {
    await testPath(200, '/api', 'Hello World!');
  })
);

test(
  '[vercel dev] Middleware that returns a 200 response',
  testFixtureStdio('middleware-response', async (testPath: any) => {
    await testPath(200, '/', 'hi from middleware');
    await testPath(200, '/another', 'hi from middleware');
  })
);

test(
  '[vercel dev] Middleware that has no response',
  testFixtureStdio('middleware-no-response', async (testPath: any) => {
    await testPath(200, '/api/hello', 'hello from a serverless function');
  })
);

test(
  '[vercel dev] Middleware that does basic rewrite',
  testFixtureStdio(
    'middleware-rewrite',
    async (testPath: any) => {
      await testPath(200, '/', '<h1>Index</h1>');
      await testPath(200, '/index', '<h1>Another</h1>');
      await testPath(200, '/another', '<h1>Another</h1>');
      await testPath(200, '/another.html', '<h1>Another</h1>');
      await testPath(200, '/foo', '<h1>Another</h1>');
      // different origin
      await testPath(200, '?to=http://example.com', /Example Domain/);
    },
    { skipDeploy: true }
  )
);

test('[vercel dev] Middleware rewrites with same origin', async () => {
  const directory = fixture('middleware-rewrite');
  const { dev, port, readyResolver } = await testFixture(directory);

  try {
    dev.unref();
    await readyResolver;

    let response = await fetch(
      `http://localhost:${port}?to=http://localhost:${port}`
    );
    validateResponseHeaders(response);
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/<h1>Index<\/h1>/);

    response = await fetch(
      `http://localhost:${port}?to=http://127.0.0.1:${port}`
    );
    validateResponseHeaders(response);
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/<h1>Index<\/h1>/);

    response = await fetch(`http://localhost:${port}?to=http://[::1]:${port}`);
    validateResponseHeaders(response);
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/<h1>Index<\/h1>/);
  } finally {
    await await dev.kill();
  }
});

test(
  '[vercel dev] Middleware that rewrites with custom query params',
  testFixtureStdio('middleware-rewrite-query', async (testPath: any) => {
    await testPath(200, '/?foo=bar', '{"url":"/?from-middleware=true"}');
    await testPath(
      200,
      '/another?foo=bar',
      '{"url":"/another?from-middleware=true"}'
    );
    await testPath(
      200,
      '/api/fn?foo=bar',
      '{"url":"/api/fn?from-middleware=true"}'
    );
  })
);

test(
  '[vercel dev] Middleware that rewrites to 404s',
  testFixtureStdio('middleware-rewrite-404', async (testPath: any) => {
    await testPath(404, '/api/edge', /NOT_FOUND/);
    await testPath(404, '/index.html', /NOT_FOUND/);
  })
);

test(
  '[vercel dev] Middleware that redirects',
  testFixtureStdio('middleware-redirect', async (testPath: any) => {
    await testPath(302, '/', null, {
      location: 'https://vercel.com/',
    });
    await testPath(302, '/home', null, {
      location: 'https://vercel.com/home',
    });
    await testPath(302, '/?foo=bar', null, {
      location: 'https://vercel.com/?foo=bar',
    });
  })
);

test(
  '[vercel dev] Middleware with error in function handler',
  testFixtureStdio('middleware-error-in-handler', async (testPath: any) => {
    await testPath(500, '/', /MIDDLEWARE_INVOCATION_FAILED/g);
  })
);

test(
  '[vercel dev] Middleware with error at init',
  testFixtureStdio('middleware-error-at-init', async (testPath: any) => {
    /*
      These assertions check two possible options because a deployed test
      of this scenario produces one result that the dev server can't currently
      replicate.
    */
    const devCode = 'MIDDLEWARE_INVOCATION_FAILED';
    const deploymentCode = 'INTERNAL_SERVER_ERROR';

    await testPath(500, '/', new RegExp(`${devCode}|${deploymentCode}`, 'g'));
  })
);

test(
  '[vercel dev] Middleware with an explicit 500 response',
  testFixtureStdio('middleware-500-response', async (testPath: any) => {
    await testPath(500, '/', 'Example Error');
  })
);

test(
  '[vercel dev] Middleware with `matchers` config',
  testFixtureStdio('middleware-matchers', async (testPath: any) => {
    await testPath(404, '/');
    await testPath(404, '/another');
    await testPath(
      200,
      '/about/page',
      '{"pathname":"/about/page","search":"","fromMiddleware":true}'
    );
    await testPath(
      200,
      '/dashboard/home',
      '{"pathname":"/dashboard/home","search":"","fromMiddleware":true}'
    );
    await testPath(
      200,
      '/dashboard/home?a=b',
      '{"pathname":"/dashboard/home","search":"?a=b","fromMiddleware":true}'
    );
  })
);

test(
  '[vercel dev] restarts dev process when `devCommand` setting is modified',
  testFixtureStdio(
    'project-settings-override',
    async (_testPath: any, port: any) => {
      const directory = fixture('project-settings-override');
      const vercelJsonPath = join(directory, 'vercel.json');
      const originalVercelJson = await fs.readJSON(vercelJsonPath);

      try {
        const originalResponse = await fetch(
          `http://localhost:${port}/index.txt`
        );
        validateResponseHeaders(originalResponse);
        const body = await originalResponse.text();
        expect(body.trim()).toEqual('This is the original');
        expect(originalResponse.status).toBe(200);

        await fs.writeJSON(vercelJsonPath, {
          devCommand: 'serve -p $PORT overridden',
        });

        const overriddenResponse = await fetch(
          `http://localhost:${port}/index.txt`
        );
        validateResponseHeaders(overriddenResponse);
        const body2 = await overriddenResponse.text();
        expect(body2.trim()).toEqual('This is the overridden!');
        expect(overriddenResponse.status).toBe(200);
      } finally {
        await fs.writeJSON(vercelJsonPath, originalVercelJson);
      }
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] Middleware can override request headers',
  testFixtureStdio(
    'middleware-request-headers-override',
    async (testPath: any) => {
      await testPath(
        200,
        '/api/dump-headers',
        (actual: string, res: Response) => {
          // Headers sent to the API route.
          const headers = JSON.parse(actual);

          // Preserved headers.
          expect(headers).toHaveProperty(
            'x-from-client-a',
            'hello from client'
          );

          // Headers added/modified by the middleware.
          expect(headers).toHaveProperty(
            'x-from-client-b',
            'hello from middleware'
          );
          expect(headers).toHaveProperty('x-from-middleware-a', 'hello a!');
          expect(headers).toHaveProperty('x-from-middleware-b', 'hello b!');

          // Headers deleted by the middleware.
          expect(headers).not.toHaveProperty('x-from-client-c');

          // Internal headers should not be visible from API routes.
          expect(headers).not.toHaveProperty('x-middleware-override-headers');
          expect(headers).not.toHaveProperty(
            'x-middleware-request-from-middleware-a'
          );
          expect(headers).not.toHaveProperty(
            'x-middleware-request-from-middleware-b'
          );

          // Request headers should not be visible from clients.
          const respHeaders = Object.fromEntries(res.headers.entries());
          expect(respHeaders).not.toHaveProperty(
            'x-middleware-override-headers'
          );
          expect(respHeaders).not.toHaveProperty(
            'x-middleware-request-from-middleware-a'
          );
          expect(respHeaders).not.toHaveProperty(
            'x-middleware-request-from-middleware-b'
          );
          expect(respHeaders).not.toHaveProperty('from-middleware-a');
          expect(respHeaders).not.toHaveProperty('from-middleware-b');
          expect(respHeaders).not.toHaveProperty('x-from-client-a');
          expect(respHeaders).not.toHaveProperty('x-from-client-b');
          expect(respHeaders).not.toHaveProperty('x-from-client-c');
        },
        /*expectedHeaders=*/ {},
        {
          headers: {
            'x-from-client-a': 'hello from client',
            'x-from-client-b': 'hello from client',
            'x-from-client-c': 'hello from client',
          },
        }
      );
    },
    { skipDeploy: true }
  )
);

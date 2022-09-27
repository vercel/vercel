import ms from 'ms';
import fs from 'fs-extra';
import { isIP } from 'net';
import { join } from 'path';

const {
  fetch,
  sleep,
  fixture,
  testFixture,
  testFixtureStdio,
  validateResponseHeaders,
} = require('./utils.js');

test(
  '[vercel dev] temporary directory listing',
  testFixtureStdio(
    'temporary-directory-listing',
    async (_testPath: any, port: any) => {
      const directory = fixture('temporary-directory-listing');
      await fs.unlink(join(directory, 'index.txt')).catch(() => null);

      await sleep(ms('20s'));

      const firstResponse = await fetch(`http://localhost:${port}`);
      validateResponseHeaders(firstResponse);
      const body = await firstResponse.text();
      console.log(body);
      expect(firstResponse.status).toBe(404);

      await fs.writeFile(join(directory, 'index.txt'), 'hello');

      for (let i = 0; i < 20; i++) {
        const response = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(response);

        if (response.status === 200) {
          const body = await response.text();
          expect(body).toBe('hello');
        }

        await sleep(ms('1s'));
      }
    },
    { skipDeploy: true }
  )
);

test('[vercel dev] add a `package.json` to trigger `@vercel/static-build`', async () => {
  const directory = fixture('trigger-static-build');

  await fs.unlink(join(directory, 'package.json')).catch(() => null);

  await fs.unlink(join(directory, 'public', 'index.txt')).catch(() => null);

  await fs.rmdir(join(directory, 'public')).catch(() => null);

  const tester = testFixtureStdio(
    'trigger-static-build',
    async (_testPath: any, port: any) => {
      {
        const response = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(response);
        const body = await response.text();
        expect(body.trim()).toBe('hello:index.txt');
      }

      const rnd = Math.random().toString();
      const pkg = {
        private: true,
        scripts: { build: `mkdir -p public && echo ${rnd} > public/index.txt` },
      };

      await fs.writeFile(join(directory, 'package.json'), JSON.stringify(pkg));

      // Wait until file events have been processed
      await sleep(ms('2s'));

      {
        const response = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(response);
        const body = await response.text();
        expect(body.trim()).toBe(rnd);
      }
    },
    { skipDeploy: true }
  );

  await tester();
});

test('[vercel dev] no build matches warning', async () => {
  const directory = fixture('no-build-matches');
  const { dev } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    // start `vercel dev` detached in child_process
    dev.unref();

    dev.stderr.setEncoding('utf8');
    await new Promise<void>(resolve => {
      dev.stderr.on('data', (str: string) => {
        if (str.includes('did not match any source files')) {
          resolve();
        }
      });
    });
  } finally {
    dev.kill('SIGTERM');
  }
});

test(
  '[vercel dev] do not recursivly check the path',
  testFixtureStdio('handle-filesystem-missing', async (testPath: any) => {
    await testPath(200, '/', /hello/m);
    await testPath(404, '/favicon.txt');
  })
);

test('[vercel dev] render warning for empty cwd dir', async () => {
  const directory = fixture('empty');
  const { dev, port } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    dev.unref();

    // Monitor `stderr` for the warning
    dev.stderr.setEncoding('utf8');
    const msg = 'There are no files inside your deployment.';
    await new Promise<void>(resolve => {
      dev.stderr.on('data', (str: string) => {
        if (str.includes(msg)) {
          resolve();
        }
      });
    });

    // Issue a request to ensure a 404 response
    await sleep(ms('3s'));
    const response = await fetch(`http://localhost:${port}`);
    validateResponseHeaders(response);
    expect(response.status).toBe(404);
  } finally {
    dev.kill('SIGTERM');
  }
});

test('[vercel dev] do not rebuild for changes in the output directory', async () => {
  const directory = fixture('output-is-source');

  const { dev, port } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    dev.unref();

    let stderr: any = [];
    const start = Date.now();

    dev.stderr.on('data', (str: any) => stderr.push(str));

    while (stderr.join('').includes('Ready') === false) {
      await sleep(ms('3s'));

      if (Date.now() - start > ms('30s')) {
        console.log('stderr:', stderr.join(''));
        break;
      }
    }

    const resp1 = await fetch(`http://localhost:${port}`);
    const text1 = await resp1.text();
    expect(text1.trim()).toBe('hello first');

    await fs.writeFile(join(directory, 'public', 'index.html'), 'hello second');

    await sleep(ms('3s'));

    const resp2 = await fetch(`http://localhost:${port}`);
    const text2 = await resp2.text();
    expect(text2.trim()).toBe('hello second');
  } finally {
    dev.kill('SIGTERM');
  }
});

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

test(
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
  '[vercel dev] Use `@vercel/python` with Flask requirements.txt',
  testFixtureStdio('python-flask', async (testPath: any) => {
    const name = 'Alice';
    const year = new Date().getFullYear();
    await testPath(200, `/api/user?name=${name}`, new RegExp(`Hello ${name}`));
    await testPath(200, `/api/date`, new RegExp(`Current date is ${year}`));
    await testPath(200, `/api/date.py`, new RegExp(`Current date is ${year}`));
    await testPath(200, `/api/headers`, (body: any, res: any) => {
      // @ts-ignore
      const { host } = new URL(res.url);
      expect(body).toBe(host);
    });
  })
);

test(
  '[vercel dev] Use custom runtime from the "functions" property',
  testFixtureStdio('custom-runtime', async (testPath: any) => {
    await testPath(200, `/api/user`, /Hello, from Bash!/m);
    await testPath(200, `/api/user.sh`, /Hello, from Bash!/m);
  })
);

test(
  '[vercel dev] Should work with nested `tsconfig.json` files',
  testFixtureStdio('nested-tsconfig', async (testPath: any) => {
    await testPath(200, `/`, /Nested tsconfig.json test page/);
    await testPath(200, `/api`, 'Nested `tsconfig.json` API endpoint');
  })
);

test(
  '[vercel dev] Should force `tsc` option "module: commonjs" for `startDevServer()`',
  testFixtureStdio('force-module-commonjs', async (testPath: any) => {
    await testPath(200, `/`, /Force &quot;module: commonjs&quot; test page/);
    await testPath(
      200,
      `/api`,
      'Force "module: commonjs" JavaScript with ES Modules API endpoint'
    );
    await testPath(
      200,
      `/api/ts`,
      'Force "module: commonjs" TypeScript API endpoint'
    );
  })
);

test(
  '[vercel dev] should prioritize index.html over other file named index.*',
  testFixtureStdio('index-html-priority', async (testPath: any) => {
    await testPath(200, '/', 'This is index.html');
    await testPath(200, '/index.css', 'This is index.css');
  })
);

test(
  '[vercel dev] Should support `*.go` API serverless functions',
  testFixtureStdio('go', async (testPath: any) => {
    await testPath(200, `/api`, 'This is the index page');
    await testPath(200, `/api/index`, 'This is the index page');
    await testPath(200, `/api/index.go`, 'This is the index page');
    await testPath(200, `/api/another`, 'This is another page');
    await testPath(200, '/api/another.go', 'This is another page');
    await testPath(200, `/api/foo`, 'Req Path: /api/foo');
    await testPath(200, `/api/bar`, 'Req Path: /api/bar');
  })
);

test(
  '[vercel dev] Should set the `ts-node` "target" to match Node.js version',
  testFixtureStdio('node-ts-node-target', async (testPath: any) => {
    await testPath(200, `/api/subclass`, '{"ok":true}');
    await testPath(
      200,
      `/api/array`,
      '{"months":[1,2,3,4,5,6,7,8,9,10,11,12]}'
    );

    await testPath(200, `/api/dump`, (body: any, res: any, isDev: any) => {
      // @ts-ignore
      const { host } = new URL(res.url);
      const { env, headers } = JSON.parse(body);

      // Test that the API endpoint receives the Vercel proxy request headers
      expect(headers['x-forwarded-host']).toBe(host);
      expect(headers['x-vercel-deployment-url']).toBe(host);
      expect(isIP(headers['x-real-ip'])).toBeTruthy();
      expect(isIP(headers['x-forwarded-for'])).toBeTruthy();
      expect(isIP(headers['x-vercel-forwarded-for'])).toBeTruthy();

      // Test that the API endpoint has the Vercel platform env vars defined.
      expect(env.NOW_REGION).toMatch(/^[a-z]{3}\d$/);
      if (isDev) {
        // Only dev is tested because in production these are opt-in.
        expect(env.VERCEL_URL).toBe(host);
        expect(env.VERCEL_REGION).toBe('dev1');
      }
    });
  })
);

test(
  '[vercel dev] Do not fail if `src` is missing',
  testFixtureStdio('missing-src-property', async (testPath: any) => {
    await testPath(200, '/', /hello:index.txt/m);
    await testPath(404, '/i-do-not-exist');
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
  testFixtureStdio('middleware-rewrite', async (testPath: any) => {
    await testPath(200, '/', '<h1>Index</h1>');
    await testPath(200, '/index', '<h1>Another</h1>');
    await testPath(200, '/another', '<h1>Another</h1>');
    await testPath(200, '/another.html', '<h1>Another</h1>');
    await testPath(200, '/foo', '<h1>Another</h1>');
    // different origin
    await testPath(200, '?to=http://example.com', /Example Domain/);
  })
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
    await dev.kill('SIGTERM');
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
    await testPath(500, '/', /EDGE_FUNCTION_INVOCATION_FAILED/);
  })
);

test(
  '[vercel dev] Middleware with error at init',
  testFixtureStdio('middleware-error-at-init', async (testPath: any) => {
    await testPath(500, '/', /EDGE_FUNCTION_INVOCATION_FAILED/);
  })
);

test(
  '[vercel dev] Middleware with an explicit 500 response',
  testFixtureStdio('middleware-500-response', async (testPath: any) => {
    await testPath(500, '/', /EDGE_FUNCTION_INVOCATION_FAILED/);
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

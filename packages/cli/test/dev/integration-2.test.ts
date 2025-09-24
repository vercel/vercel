import assert from 'assert';
import { isIP } from 'net';
import { exec, fixture, testFixture, testFixtureStdio } from './utils';

test('[vercel dev] validate redirects', async () => {
  const directory = fixture('invalid-redirects');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `redirects\[0\].statusCode` should be integer/m
  );
});

test('[vercel dev] validate headers', async () => {
  const directory = fixture('invalid-headers');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `headers\[0\].headers\[0\].value` should be string/m
  );
});

test('[vercel dev] validate mixed routes and rewrites', async () => {
  const directory = fixture('invalid-mixed-routes-rewrites');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /If `rewrites`, `redirects`, `headers`, `cleanUrls` or `trailingSlash` are used, then `routes` cannot be present./m
  );
  expect(output.stderr).toMatch(/vercel\.link\/mix-routing-props/m);
});

test('[vercel dev] validate env var names', async () => {
  const directory = fixture('invalid-env-var-name');
  const { dev } = await testFixture(directory);

  try {
    let stderr = '';

    await new Promise<void>((resolve, reject) => {
      assert(dev.stderr);
      dev.stderr.on('data', (b: string) => {
        stderr += b;
        if (
          stderr.includes('Ignoring env var "1" because name is invalid') &&
          stderr.includes(
            'The name contains invalid characters. Only letters, digits, and underscores are allowed. Furthermore, the name should not start with a digit'
          )
        ) {
          resolve();
        }
      });

      dev.on('error', reject);
      dev.on('close', resolve);
    });
  } finally {
    await dev.kill();
  }
});

test(
  '[vercel dev] test rewrites with segments serve correct content',
  testFixtureStdio('test-rewrites-with-segments', async (testPath: any) => {
    await testPath(200, '/api/users/first', 'first');
    await testPath(200, '/api/fourty-two', '42');
    await testPath(200, '/rand', '42');
    await testPath(200, '/api/dynamic', 'dynamic');
    await testPath(404, '/api');
  })
);

test(
  '[vercel dev] test rewrites serve correct content',
  testFixtureStdio('test-rewrites', async (testPath: any) => {
    await testPath(200, '/hello', 'Hello World');
    await testPath(425, '/status-rewrite-425', 'Hello World');
  })
);

test(
  '[vercel dev] test rewrites and redirects serve correct external content',
  testFixtureStdio(
    'test-external-rewrites-and-redirects',
    async (testPath: any) => {
      const vcRobots = `https://vercel.com/robots.txt`;
      await testPath(200, '/rewrite', /User-Agent: \*/m);
      await testPath(308, '/redirect', `Redirecting...`, {
        Location: vcRobots,
      });
      await testPath(307, '/tempRedirect', `Redirecting...`, {
        Location: vcRobots,
      });
    }
  )
);

test(
  '[vercel dev] test rewrites and redirects is case sensitive',
  testFixtureStdio('test-routing-case-sensitive', async (testPath: any) => {
    await testPath(200, '/Path', 'UPPERCASE');
    await testPath(200, '/path', 'lowercase');
    await testPath(308, '/GoTo', 'Redirecting...', {
      Location: '/upper.html',
    });
    await testPath(308, '/goto', 'Redirecting...', {
      Location: '/lower.html',
    });
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
      const { host } = new URL(res.url);
      expect(body).toBe(host);
    });
  })
);

test(
  '[vercel dev] Use `@vercel/python` with FastAPI requirements.txt',
  testFixtureStdio('python-fastapi', async (testPath: any) => {
    const name = 'Alice';
    await testPath(200, `/`, new RegExp(`Hello, World!`));
    await testPath(200, `/api`, new RegExp(`Hello, API!`));
    await testPath(200, `/api/hello/${name}`, new RegExp(`Hello, ${name}!`));
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
  '[vercel dev] Should support `*.go` API serverless functions with external modules',
  testFixtureStdio('go-external-module', async (testPath: any) => {
    await testPath(200, `/api`, 'hello from go!');
    await testPath(200, `/api/index`, 'hello from go!');
    await testPath(200, `/api/index.go`, 'hello from go!');
  })
);

test(
  '[vercel dev] Should support `*.go` API serverless functions with `go.work` and lib',
  testFixtureStdio('go-work-with-shared', async (testPath: any) => {
    await testPath(200, `/api`, 'hello:go1.20.14');
  })
);

// Skipping because it doesn't run yet on Node 22
// eslint-disable-next-line jest/no-disabled-tests
test.skip(
  '[vercel dev] Should set the `ts-node` "target" to match Node.js version',
  testFixtureStdio('node-ts-node-target', async (testPath: any) => {
    await testPath(200, `/api/subclass`, '{"ok":true}');
    await testPath(
      200,
      `/api/array`,
      '{"months":[1,2,3,4,5,6,7,8,9,10,11,12]}'
    );

    await testPath(200, `/api/dump`, (body: any, res: any, isDev: any) => {
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

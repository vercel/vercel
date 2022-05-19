import os from 'os';
import fs from 'fs-extra';
import { join } from 'path';

const {
  exec,
  fetch,
  fixture,
  testFixture,
  testFixtureStdio,
} = require('./utils.js');

test('[vercel dev] prints `npm install` errors', async () => {
  const dir = fixture('runtime-not-installed');
  const result = await exec(dir);
  expect(result.stderr.includes('npm ERR! 404')).toBeTruthy();
  expect(
    result.stderr.includes('Failed to install `vercel dev` dependencies')
  ).toBeTruthy();
  expect(
    result.stderr.includes('https://vercel.link/npm-install-failed-dev')
  ).toBeTruthy();
});

test('[vercel dev] `vercel.json` should be invalidated if deleted', async () => {
  const dir = fixture('invalidate-vercel-config');
  const configPath = join(dir, 'vercel.json');
  const originalConfig = await fs.readJSON(configPath);
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    {
      // Env var should be set from `vercel.json`
      const res = await fetch(`http://localhost:${port}/api`);
      const body = await res.json();
      expect(body.FOO).toBe('bar');
    }

    {
      // Env var should not be set after `vercel.json` is deleted
      await fs.remove(configPath);

      const res = await fetch(`http://localhost:${port}/api`);
      const body = await res.json();
      expect(body.FOO).toBe(undefined);
    }
  } finally {
    dev.kill('SIGTERM');
    await fs.writeJSON(configPath, originalConfig);
  }
});

test('[vercel dev] reflects changes to config and env without restart', async () => {
  const dir = fixture('node-helpers');
  const configPath = join(dir, 'vercel.json');
  const originalConfig = await fs.readJSON(configPath);
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    {
      // Node.js helpers should be available by default
      const res = await fetch(`http://localhost:${port}/?foo=bar`);
      const body = await res.json();
      expect(body.hasHelpers).toBe(true);
      expect(body.query.foo).toBe('bar');
    }

    {
      // Disable the helpers via `config.helpers = false`
      const config = {
        ...originalConfig,
        builds: [
          {
            ...originalConfig.builds[0],
            config: {
              helpers: false,
            },
          },
        ],
      };
      await fs.writeJSON(configPath, config);

      const res = await fetch(`http://localhost:${port}/?foo=bar`);
      const body = await res.json();
      expect(body.hasHelpers).toBe(false);
      expect(body.query).toBe(undefined);
    }

    {
      // Enable the helpers via `config.helpers = true`
      const config = {
        ...originalConfig,
        builds: [
          {
            ...originalConfig.builds[0],
            config: {
              helpers: true,
            },
          },
        ],
      };
      await fs.writeJSON(configPath, config);

      const res = await fetch(`http://localhost:${port}/?foo=baz`);
      const body = await res.json();
      expect(body.hasHelpers).toBe(true);
      expect(body.query.foo).toBe('baz');
    }

    {
      // Disable the helpers via `NODEJS_HELPERS = '0'`
      const config = {
        ...originalConfig,
        build: {
          env: {
            NODEJS_HELPERS: '0',
          },
        },
      };
      await fs.writeJSON(configPath, config);

      const res = await fetch(`http://localhost:${port}/?foo=baz`);
      const body = await res.json();
      expect(body.hasHelpers).toBe(false);
      expect(body.query).toBe(undefined);
    }

    {
      // Enable the helpers via `NODEJS_HELPERS = '1'`
      const config = {
        ...originalConfig,
        build: {
          env: {
            NODEJS_HELPERS: '1',
          },
        },
      };
      await fs.writeJSON(configPath, config);

      const res = await fetch(`http://localhost:${port}/?foo=boo`);
      const body = await res.json();
      expect(body.hasHelpers).toBe(true);
      expect(body.query.foo).toBe('boo');
    }
  } finally {
    dev.kill('SIGTERM');
    await fs.writeJSON(configPath, originalConfig);
  }
});

test('[vercel dev] `@vercel/node` TypeScript should be resolved by default', async () => {
  // The purpose of this test is to test that `@vercel/node` can properly
  // resolve the default "typescript" module when the project doesn't include
  // its own version. To properly test for this, a fixture needs to be created
  // *outside* of the `vercel` repo, since otherwise the root-level
  // "node_modules/typescript" is resolved as relative to the project, and
  // not relative to `@vercel/node` which is what we are testing for here.
  const dir = join(os.tmpdir(), 'vercel-node-typescript-resolve-test');
  const apiDir = join(dir, 'api');
  await fs.mkdirp(apiDir);
  await fs.writeFile(
    join(apiDir, 'hello.js'),
    'export default (req, res) => { res.end("world"); }'
  );

  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/api/hello`);
    const body = await res.text();
    expect(body).toBe('world');
  } finally {
    dev.kill('SIGTERM');
    await fs.remove(dir);
  }
});

test(
  '[vercel dev] validate routes that use `check: true`',
  testFixtureStdio('routes-check-true', async (testPath: any) => {
    await testPath(200, '/blog/post', 'Blog Home');
  })
);

test(
  '[vercel dev] validate routes that use `check: true` and `status` code',
  testFixtureStdio('routes-check-true-status', async (testPath: any) => {
    await testPath(403, '/secret');
    await testPath(200, '/post', 'This is a post.');
    await testPath(200, '/post.html', 'This is a post.');
  })
);

test(
  '[vercel dev] validate routes that use custom 404 page',
  testFixtureStdio('routes-custom-404', async (testPath: any) => {
    await testPath(200, '/', 'Home Page');
    await testPath(404, '/nothing', 'Custom User 404');
    await testPath(404, '/exact', 'Exact Custom 404');
    await testPath(200, '/api/hello', 'Hello');
    await testPath(404, '/api/nothing', 'Custom User 404');
  })
);

test(
  '[vercel dev] handles miss after route',
  testFixtureStdio('handle-miss-after-route', async (testPath: any) => {
    await testPath(200, '/post', 'Blog Post Page', {
      test: '1',
      override: 'one',
    });
  })
);

test(
  '[vercel dev] handles miss after rewrite',
  testFixtureStdio('handle-miss-after-rewrite', async (testPath: any) => {
    await testPath(200, '/post', 'Blog Post Page', {
      test: '1',
      override: 'one',
    });
    await testPath(200, '/blog/post', 'Blog Post Page', {
      test: '1',
      override: 'two',
    });
    await testPath(404, '/blog/about.html', undefined, {
      test: '1',
      override: 'two',
    });
  })
);

test(
  '[vercel dev] does not display directory listing after 404',
  testFixtureStdio('handle-miss-hide-dir-list', async (testPath: any) => {
    await testPath(404, '/post');
    await testPath(200, '/post/one.html', 'First Post');
  })
);

test(
  '[vercel dev] should preserve query string even after miss phase',
  testFixtureStdio('handle-miss-querystring', async (testPath: any) => {
    await testPath(200, '/', 'Index Page');
    if (process.env.CI && process.platform === 'darwin') {
      console.log('Skipping since GH Actions hangs for some reason');
    } else {
      await testPath(200, '/echo/first/second', 'a=first,b=second');
      await testPath(200, '/functions/echo.js?a=one&b=two', 'a=one,b=two');
    }
  })
);

test(
  '[vercel dev] handles hit after handle: filesystem',
  testFixtureStdio('handle-hit-after-fs', async (testPath: any) => {
    await testPath(200, '/blog.html', 'Blog Page', { test: '1' });
  })
);

test(
  '[vercel dev] handles hit after dest',
  testFixtureStdio('handle-hit-after-dest', async (testPath: any) => {
    await testPath(200, '/post', 'Blog Post', { test: '1', override: 'one' });
  })
);

test(
  '[vercel dev] handles hit after rewrite',
  testFixtureStdio('handle-hit-after-rewrite', async (testPath: any) => {
    await testPath(200, '/post', 'Blog Post', { test: '1', override: 'one' });
  })
);

test(
  '[vercel dev] should serve the public directory and api functions',
  testFixtureStdio('public-and-api', async (testPath: any) => {
    await testPath(200, '/', 'This is the home page');
    await testPath(200, '/about.html', 'This is the about page');
    await testPath(200, '/.well-known/humans.txt', 'We come in peace');
    await testPath(200, '/api/date', /current date/);
    await testPath(200, '/api/rand', /random number/);
    await testPath(200, '/api/rand.js', /random number/);
    await testPath(404, '/api/api', /NOT_FOUND/m);
    await testPath(404, '/nothing', /Custom 404 Page/);
  })
);

test(
  '[vercel dev] should allow user rewrites for path segment files',
  testFixtureStdio('test-zero-config-rewrite', async (testPath: any) => {
    await testPath(404, '/');
    await testPath(200, '/echo/1', '{"id":"1"}', {
      'Access-Control-Allow-Origin': '*',
    });
    await testPath(200, '/echo/2', '{"id":"2"}', {
      'Access-Control-Allow-Headers': '*',
    });
  })
);

test('[vercel dev] validate builds', async () => {
  const directory = fixture('invalid-builds');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `builds\[0\].src` should be string/m
  );
});

test('[vercel dev] validate routes', async () => {
  const directory = fixture('invalid-routes');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `routes\[0\].src` should be string/m
  );
});

test('[vercel dev] validate cleanUrls', async () => {
  const directory = fixture('invalid-clean-urls');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `cleanUrls` should be boolean/m
  );
});

test('[vercel dev] validate trailingSlash', async () => {
  const directory = fixture('invalid-trailing-slash');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `trailingSlash` should be boolean/m
  );
});

test('[vercel dev] validate rewrites', async () => {
  const directory = fixture('invalid-rewrites');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `rewrites\[0\].destination` should be string/m
  );
});

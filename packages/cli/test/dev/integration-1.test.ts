import os from 'os';
import url from 'url';
import fs from 'fs-extra';
import { join } from 'path';
import { listen } from 'async-listen';
import stripAnsi from 'strip-ansi';
import { createServer } from 'http';
import {
  exec,
  fetch,
  fixture,
  testFixture,
  testFixtureStdio,
  validateResponseHeaders,
} from './utils';

test('[verdel dev] should support serverless functions', async () => {
  const dir = fixture('serverless-function');
  const { dev, port, readyResolver } = await testFixture(dir, {});

  try {
    await readyResolver;
    const res = await fetch(`http://localhost:${port}/api?foo=bar`);
    validateResponseHeaders(res);
    const payload = (await res.json()) as Record<string, any>;
    expect(payload).toMatchObject({ url: '/api?foo=bar', method: 'GET' });
    expect(payload.headers.host).toBe(payload.headers['x-forwarded-host']);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support edge functions', async () => {
  const dir = fixture('edge-function');
  const { dev, port, readyResolver } = await testFixture(dir, {
    env: {
      ENV_VAR_IN_EDGE: '1',
    },
  });

  try {
    await readyResolver;

    const body = { hello: 'world' };

    const res = await fetch(`http://localhost:${port}/api/edge-success`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    validateResponseHeaders(res);

    // support for edge functions has to manually ensure that these properties
    // are set up; so, we test that they are all passed through properly
    const payload = (await res.json()) as Record<string, any>;
    expect(payload).toMatchObject({
      headers: { 'content-type': 'application/json' },
      url: `http://localhost:${port}/api/edge-success`,
      method: 'POST',
      body: '{"hello":"world"}',
      snakeCase: 'some_camel_case_thing',
      upperCase: 'SOMETHING',
      optionalChaining: 'fallback',
      ENV_VAR_IN_EDGE: '1',
    });
    expect(payload.headers.host).toBe(payload.headers['x-forwarded-host']);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] edge functions support WebAssembly files', async () => {
  const dir = fixture('edge-function');
  const { dev, port, readyResolver } = await testFixture(dir, {
    env: {
      ENV_VAR_IN_EDGE: '1',
    },
  });

  try {
    await readyResolver;

    for (const { number, result } of [
      { number: 1, result: 2 },
      { number: 2, result: 3 },
      { number: 12, result: 13 },
    ]) {
      const res = await fetch(
        `http://localhost:${port}/api/webassembly?number=${number}`
      );
      validateResponseHeaders(res);
      await expect(res.text()).resolves.toEqual(`${number} + 1 = ${result}`);
    }
  } finally {
    await dev.kill();
  }
});

test(
  '[vercel dev] edge functions respond properly the same as production',
  testFixtureStdio('edge-function', async (testPath: any) => {
    await testPath(500, '/api/edge-500-response');
    await testPath(200, '/api/edge-success');
    await testPath(200, '/api/edge-import-browser');
  })
);

test('[vercel dev] throws an error when an edge function has no response', async () => {
  const dir = fixture('edge-function-error');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/api/edge-no-response`);
    validateResponseHeaders(res);

    const { stdout } = await dev.kill();

    expect(await res.status).toBe(500);
    expect(await res.text()).toMatch('FUNCTION_INVOCATION_FAILED');
    expect(stdout).toMatch(
      /Error from API Route \/api\/edge-no-response: Edge Function did not return a response./g
    );
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support edge functions returning intentional 500 responses', async () => {
  const dir = fixture('edge-function');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const body = { hello: 'world' };

    const res = await fetch(`http://localhost:${port}/api/edge-500-response`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    validateResponseHeaders(res);

    expect(await res.status).toBe(500);
    expect(await res.text()).toBe(
      'responding with intentional 500 from user code'
    );
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should handle runtime errors thrown in edge functions', async () => {
  const dir = fixture('edge-function-error');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/api/edge-error-runtime`, {
      method: 'GET',
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    validateResponseHeaders(res);

    const { stdout } = await dev.kill();

    expect(await res.text()).toMatch(
      /<strong>500<\/strong>: INTERNAL_SERVER_ERROR/g
    );
    expect(stdout).toMatch(
      /Error from API Route \/api\/edge-error-runtime: intentional runtime error/g
    );
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should handle config errors thrown in edge functions', async () => {
  const dir = fixture('edge-function-error');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/api/edge-error-config`, {
      method: 'GET',
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    validateResponseHeaders(res);

    const { stderr } = await dev.kill();

    expect(await res.text()).toMatch(
      /<strong>500<\/strong>: INTERNAL_SERVER_ERROR/g
    );
    expect(stderr).toContain(
      'api/edge-error-config.js: unsupported "runtime" value in `config`: "invalid-runtime-value" (must be one of: ["edge","experimental-edge","nodejs"]). Learn more: https://vercel.link/creating-edge-functions'
    );
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should handle startup errors thrown in edge functions', async () => {
  const dir = fixture('edge-function-error');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/api/edge-error-startup`, {
      method: 'GET',
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    validateResponseHeaders(res);

    const { stderr } = await dev.kill();

    expect(await res.text()).toMatch(
      /<strong>500<\/strong>: INTERNAL_SERVER_ERROR/g
    );
    expect(stderr).toMatch(/Failed to instantiate edge runtime./g);
    expect(stderr).toMatch(/intentional startup error/g);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should handle syntax errors thrown in edge functions', async () => {
  const dir = fixture('edge-function-error');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/api/edge-error-syntax`, {
      method: 'GET',
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    validateResponseHeaders(res);

    const { stderr } = await dev.kill();

    expect(await res.text()).toMatch(
      /<strong>500<\/strong>: INTERNAL_SERVER_ERROR/g
    );
    expect(stderr).toMatch(/Failed to compile user code for edge runtime./g);
    expect(stderr).toMatch(/Unexpected end of file/g);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should handle import errors thrown in edge functions', async () => {
  const dir = fixture('edge-function-error');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(
      `http://localhost:${port}/api/edge-error-unknown-import`,
      {
        method: 'GET',
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }
    );
    validateResponseHeaders(res);

    const { stderr } = await dev.kill();

    expect(await res.text()).toMatch(
      /<strong>500<\/strong>: INTERNAL_SERVER_ERROR/g
    );
    expect(stderr).toMatch(
      /Could not resolve "unknown-module-893427589372458934795843"/g
    );
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should handle missing handler errors thrown in edge functions', async () => {
  const dir = fixture('edge-function-error');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(
      `http://localhost:${port}/api/edge-error-no-handler`,
      {
        method: 'GET',
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }
    );
    validateResponseHeaders(res);

    const { stdout } = await dev.kill();

    expect(await res.text()).toMatch(
      /<strong>500<\/strong>: INTERNAL_SERVER_ERROR/g
    );
    const url = `http://localhost:${port}/api/edge-error-no-handler`;
    expect(stdout).toMatchInlineSnapshot(`
      "Error from API Route /api/edge-error-no-handler: No default or HTTP-named export was found at ${url}. Add one to handle requests. Learn more: https://vercel.link/creating-edge-middleware
          at (api/edge-error-no-handler.js)
      "
    `);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should handle invalid middleware config', async () => {
  const dir = fixture('middleware-matchers-invalid');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/api/whatever`, {
      method: 'GET',
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    validateResponseHeaders(res);

    const { stderr } = await dev.kill();

    expect(await res.text()).toMatch(
      /<strong>500<\/strong>: INTERNAL_SERVER_ERROR/g
    );
    expect(stderr).toMatch(
      /Middleware's `config.matcher` .+ Received: not-a-valid-matcher/g
    );
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support request body', async () => {
  const dir = fixture('node-request-body');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const body = { hello: 'world' };

    // Test that `req.body` works in dev
    let res = await fetch(`http://localhost:${port}/api/req-body`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    validateResponseHeaders(res);
    expect((await res.json()) as Record<string, any>).toMatchObject({
      body,
      readBody: body,
    });

    // Test that `req` "data" events work in dev
    res = await fetch(`http://localhost:${port}/api/data-events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should maintain query when invoking serverless function', async () => {
  const dir = fixture('node-query-invoke');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/something?url-param=a`);
    validateResponseHeaders(res);

    const text = await res.text();
    const parsed = url.parse(text, true);
    expect(parsed.pathname).toEqual('/something');
    expect(parsed.query['url-param']).toEqual('a');
    expect(parsed.query['route-param']).toEqual('b');
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should maintain query when proxy passing', async () => {
  const dir = fixture('query-proxy');
  const { dev, port, readyResolver } = await testFixture(dir);
  const dest = createServer((req, res) => {
    res.end(req.url);
  });

  try {
    await Promise.all([readyResolver, listen(dest, 0)]);

    const destAddr = dest.address();
    if (!destAddr || typeof destAddr === 'string') {
      throw new Error('Unexpected HTTP address');
    }

    const res = await fetch(
      `http://localhost:${port}/${destAddr.port}?url-param=a`
    );
    validateResponseHeaders(res);

    const text = await res.text();
    const parsed = url.parse(text, true);
    expect(parsed.pathname).toEqual('/something');
    expect(parsed.query['url-param']).toEqual('a');
    expect(parsed.query['route-param']).toEqual('b');
  } finally {
    dest.close();
    await dev.kill();
  }
});

test('[vercel dev] should maintain query when dev server defines routes', async () => {
  const dir = fixture('dev-server-query');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/test?url-param=a`);
    validateResponseHeaders(res);

    const text = await res.text();

    // Hacky way of getting the page payload from the response
    // HTML since we don't have a HTML parser handy.
    const json = text
      .match(/<pre>(.*)<\/pre>/)![1]
      .replace('</pre>', '')
      .replace('<!-- -->', '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    const parsed = JSON.parse(json);
    const query = url.parse(parsed.url, true).query;

    expect(query['url-param']).toEqual('a');
    expect(query['route-param']).toEqual('b');
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should allow `cache-control` to be overwritten', async () => {
  const dir = fixture('headers');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(
      `http://localhost:${port}/?name=cache-control&value=immutable`
    );
    expect(res.headers.get('cache-control')).toEqual('immutable');
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should send `etag` header for static files', async () => {
  const dir = fixture('headers');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/foo.txt`);
    const expected = 'd263af8ab880c0b97eb6c5c125b5d44f9e5addd9';
    expect(res.headers.get('etag')).toEqual(`"${expected}"`);
    const body = await res.text();
    expect(body.trim()).toEqual('hi');
  } finally {
    await dev.kill();
  }
});

// https://linear.app/vercel/issue/ZERO-3240/unskip-random-test-failures
// eslint-disable-next-line jest/no-disabled-tests
test.skip('[vercel dev] should frontend dev server and routes', async () => {
  const dir = fixture('dev-server-and-routes');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    let res = await fetch(`http://localhost:${port}/`);
    validateResponseHeaders(res);
    const podId = res.headers.get('x-vercel-id')!.match(/:(\w+)-/)![1];
    let body = await res.text();
    expect(body).toContain('hello, this is the frontend');

    res = await fetch(`http://localhost:${port}/api/users`);
    validateResponseHeaders(res, podId);
    body = await res.text();
    expect(body).toEqual('users');

    res = await fetch(`http://localhost:${port}/api/users/1`);
    validateResponseHeaders(res, podId);
    body = await res.text();
    expect(body).toEqual('users/1');

    res = await fetch(`http://localhost:${port}/api/welcome`);
    validateResponseHeaders(res, podId);
    body = await res.text();
    expect(body).toEqual('hello and welcome');
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support `@vercel/static` routing', async () => {
  const dir = fixture('static-routes');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toEqual(200);
    const body = await res.text();
    expect(body.trim()).toEqual('<body>Hello!</body>');
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support `@vercel/static-build` routing', async () => {
  const dir = fixture('static-build-routing');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    const res = await fetch(`http://localhost:${port}/api/date`);
    expect(res.status).toEqual(200);
    const body = await res.text();
    expect(body).toMatch(/^The current date/);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support directory listing', async () => {
  const dir = fixture('directory-listing');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    // Get directory listing
    let res = await fetch(`http://localhost:${port}/`);
    let body = await res.text();
    expect(res.status).toEqual(200);
    expect(body).toContain('Index of');

    // Get a file
    res = await fetch(`http://localhost:${port}/file.txt`);
    body = await res.text();
    expect(res.status).toEqual(200);
    expect(body.trim()).toEqual('Hello from file!');

    // Invoke a lambda
    res = await fetch(`http://localhost:${port}/lambda.js`);
    body = await res.text();
    expect(res.status).toEqual(200);
    expect(body).toEqual('Hello from Lambda!');

    // Trigger a 404
    res = await fetch(`http://localhost:${port}/does-not-exist`);
    expect(res.status).toEqual(404);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should respond with 404 listing with Accept header support', async () => {
  const dir = fixture('directory-listing');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    // HTML response
    let res = await fetch(`http://localhost:${port}/does-not-exist`, {
      headers: {
        Accept: 'text/html',
      },
    });
    expect(res.status).toEqual(404);
    expect(res.headers.get('content-type')).toEqual('text/html; charset=utf-8');
    let body = await res.text();
    expect(body).toMatch(/^<!DOCTYPE html>/);

    // JSON response
    res = await fetch(`http://localhost:${port}/does-not-exist`, {
      headers: {
        Accept: 'application/json',
      },
    });
    expect(res.status).toEqual(404);
    expect(res.headers.get('content-type')).toEqual('application/json');
    body = await res.text();
    expect(body).toEqual(
      '{"error":{"code":404,"message":"The page could not be found."}}\n'
    );

    // Plain text response
    res = await fetch(`http://localhost:${port}/does-not-exist`);
    expect(res.status).toEqual(404);
    body = await res.text();
    expect(res.headers.get('content-type')).toEqual(
      'text/plain; charset=utf-8'
    );
    expect(body).toEqual('The page could not be found.\n\nNOT_FOUND\n');
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support `public` directory with zero config', async () => {
  const dir = fixture('api-with-public');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    let res = await fetch(`http://localhost:${port}/api/user`);
    let body = await res.text();
    expect(body).toEqual('hello:user');

    res = await fetch(`http://localhost:${port}/`);
    body = await res.text();
    expect(body).toMatch(/^<h1>hello world<\/h1>/);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support static files with zero config', async () => {
  const dir = fixture('api-with-static');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    let res = await fetch(`http://localhost:${port}/api/user`);
    let body = await res.text();
    expect(body).toEqual('bye:user');

    res = await fetch(`http://localhost:${port}/`);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    body = await res.text();
    expect(body).toMatch(/^<h1>goodbye world<\/h1>/);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] should support custom 404 routes', async () => {
  const dir = fixture('custom-404');
  const { dev, port, readyResolver } = await testFixture(dir);

  try {
    await readyResolver;

    // Test custom 404 with static dest
    let res = await fetch(`http://localhost:${port}/error.html`);
    expect(res.status).toEqual(404);
    let body = await res.text();
    expect(body.trim()).toEqual('<div>Custom 404 page</div>');

    // Test custom 404 with lambda dest
    res = await fetch(`http://localhost:${port}/error.js`);
    expect(res.status).toEqual(404);
    body = await res.text();
    expect(body).toEqual('Custom 404 Lambda\n');

    // Test regular 404 still works
    res = await fetch(`http://localhost:${port}/does-not-exist`);
    expect(res.status).toEqual(404);
    body = await res.text();
    expect(body).toEqual('The page could not be found.\n\nNOT_FOUND\n');
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] prints `npm install` errors', async () => {
  const dir = fixture('runtime-not-installed');
  const result = await exec(dir);
  expect(stripAnsi(result.stderr.toString())).toContain(
    'Error: The package `@vercel/does-not-exist` is not published on the npm registry'
  );
  expect(result.stderr).toContain(
    'https://vercel.link/builder-dependencies-install-failed'
  );
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
      const body = (await res.json()) as Record<string, any>;
      expect(body.FOO).toBe('bar');
    }

    {
      // Env var should not be set after `vercel.json` is deleted
      await fs.remove(configPath);

      const res = await fetch(`http://localhost:${port}/api`);
      const body = (await res.json()) as Record<string, any>;
      expect(body.FOO).toBe(undefined);
    }
  } finally {
    await dev.kill();
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
      const body = (await res.json()) as Record<string, any>;
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
      const body = (await res.json()) as Record<string, any>;
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
      const body = (await res.json()) as Record<string, any>;
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
      const body = (await res.json()) as Record<string, any>;
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
      const body = (await res.json()) as Record<string, any>;
      expect(body.hasHelpers).toBe(true);
      expect(body.query.foo).toBe('boo');
    }
  } finally {
    await dev.kill();
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
    await dev.kill();
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

// This looks like a cdn or proxy issue we're experiencing right now
// eslint-disable-next-line jest/no-disabled-tests
test.skip(
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
      // eslint-disable-next-line no-console
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

test(
  '[vercel dev] should correctly proxy to vite dev',
  testFixtureStdio(
    'vite-dev',
    async (testPath: any) => {
      const url = '/src/App.vue?vue&type=style&index=0&lang.css';
      // The first request should return the HTML template
      await testPath(200, url, /<template>/gm);
      // The second request should return the HMR JS
      await testPath(200, url, /__vite__createHotContext/gm);
      // Home page should always return HTML
      await testPath(200, '/', /<title>Vite App<\/title>/gm);
    },
    { skipDeploy: true }
  )
);

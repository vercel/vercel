import url from 'url';
import test from 'ava';
import path from 'path';
import execa from 'execa';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import listen from 'async-listen';
import { createServer } from 'http';
import createOutput from '../src/util/output';
import DevServer from '../src/util/dev/server';
import { installBuilders, getBuildUtils } from '../src/util/dev/builder-cache';
import parseListen from '../src/util/dev/parse-listen';

async function runNpmInstall(fixturePath) {
  if (await fs.exists(path.join(fixturePath, 'package.json'))) {
    return execa('yarn', ['install'], { cwd: fixturePath, shell: true });
  }
}

const skipOnWindows = new Set([
  'now-dev-default-builds-and-routes',
  'now-dev-static-routes',
  'now-dev-static-build-routing',
  'now-dev-directory-listing',
  'now-dev-api-with-public',
  'now-dev-api-with-static',
  'now-dev-custom-404',
]);

function testFixture(name, fn) {
  return async t => {
    if (process.platform === 'win32' && skipOnWindows.has(name)) {
      console.log(`Skipping test "${name}" on Windows.`);
      t.is(true, true);
      return;
    }

    let server;

    const fixturePath = path.join(__dirname, 'fixtures', 'unit', name);

    await runNpmInstall(fixturePath);

    try {
      let readyResolve;
      let readyPromise = new Promise(resolve => {
        readyResolve = resolve;
      });

      const debug = true;
      const output = createOutput({ debug });
      const origReady = output.ready;

      output.ready = msg => {
        if (msg.toString().match(/Available at/)) {
          readyResolve();
        }
        origReady(msg);
      };

      server = new DevServer(fixturePath, { output, debug });

      await server.start(0);
      await readyPromise;

      await fn(t, server);
    } finally {
      await server.stop();
    }
  };
}

function validateResponseHeaders(t, res, podId = null) {
  t.is(res.headers.get('server'), 'Vercel');
  t.truthy(res.headers.get('cache-control').length > 0);
  t.truthy(
    /^dev1::(dev1::)?[0-9a-z]{5}-[1-9][0-9]+-[a-f0-9]{12}$/.test(
      res.headers.get('x-vercel-id')
    )
  );
  if (podId) {
    t.truthy(
      res.headers.get('x-vercel-id').startsWith(`dev1::${podId}`) ||
        res.headers.get('x-vercel-id').startsWith(`dev1::dev1::${podId}`)
    );
  }
}

test(
  '[DevServer] Test request body',
  testFixture('now-dev-request-body', async (t, server) => {
    {
      // Test that `req.body` works in dev
      const res = await fetch(`${server.address}/api/req-body`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ hello: 'world' }),
      });
      const body = await res.json();
      t.is(body.hello, 'world');
    }

    {
      // Test that `req` "data" events work in dev
      const res = await fetch(`${server.address}/api/data-events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ hello: 'world' }),
      });
      const body = await res.json();
      t.is(body.hello, 'world');
    }
  })
);

test(
  '[DevServer] Maintains query when invoking lambda',
  testFixture('now-dev-query-invoke', async (t, server) => {
    const res = await fetch(`${server.address}/something?url-param=a`);
    validateResponseHeaders(t, res);

    const text = await res.text();
    const parsed = url.parse(text, true);
    t.is(parsed.pathname, '/something');
    t.is(parsed.query['url-param'], 'a');
    t.is(parsed.query['route-param'], 'b');
  })
);

test(
  '[DevServer] Maintains query when proxy passing',
  testFixture('now-dev-query-proxy', async (t, server) => {
    const dest = createServer((req, res) => {
      res.end(req.url);
    });
    await listen(dest, 0);
    const { port } = dest.address();

    try {
      const res = await fetch(`${server.address}/${port}?url-param=a`);
      validateResponseHeaders(t, res);

      const text = await res.text();
      const parsed = url.parse(text, true);
      t.is(parsed.pathname, '/something');
      t.is(parsed.query['url-param'], 'a');
      t.is(parsed.query['route-param'], 'b');
    } finally {
      dest.close();
    }
  })
);

test(
  '[DevServer] Maintains query when builder defines routes',
  testFixture('now-dev-next', async (t, server) => {
    const res = await fetch(`${server.address}/something?url-param=a`);
    validateResponseHeaders(t, res);

    const text = await res.text();

    // Hacky way of getting the page payload from the response
    // HTML since we don't have a HTML parser handy.
    const json = text
      .match(/<div>(.*)<\/div>/)[1]
      .replace('</div>', '')
      .replace(/&quot;/g, '"');
    const parsed = JSON.parse(json);

    t.is(parsed.query['url-param'], 'a');
    t.is(parsed.query['route-param'], 'b');
  })
);

test(
  '[DevServer] Allow `cache-control` to be overwritten',
  testFixture('now-dev-headers', async (t, server) => {
    const res = await fetch(
      `${server.address}/?name=cache-control&value=immutable`
    );
    t.is(res.headers.get('cache-control'), 'immutable');
  })
);

test(
  '[DevServer] Sends `etag` header for static files',
  testFixture('now-dev-headers', async (t, server) => {
    if (process.platform === 'win32') {
      console.log(
        'Skipping "etag" test on windows since it yields a different result.'
      );
      t.is(true, true);
      return;
    }
    const res = await fetch(`${server.address}/foo.txt`);
    t.is(res.headers.get('etag'), '"d263af8ab880c0b97eb6c5c125b5d44f9e5addd9"');
    t.is(await res.text(), 'hi\n');
  })
);

test('[DevServer] Does not install builders if there are no builds', async t => {
  const handler = data => {
    if (data.includes('installing')) {
      t.fail();
    }
  };

  process.stdout.addListener('data', handler);
  process.stderr.addListener('data', handler);

  const output = createOutput({ debug: false });
  await installBuilders(new Set(), undefined, output);

  process.stdout.removeListener('data', handler);
  process.stderr.removeListener('data', handler);

  t.pass();
});

test('[DevServer] Installs canary build-utils if one more more builders is canary', t => {
  t.is(
    getBuildUtils(['@vercel/static', '@vercel/node@canary'], 'vercel'),
    '@vercel/build-utils@canary'
  );
  t.is(
    getBuildUtils(['@vercel/static', '@vercel/node@0.7.4-canary.0'], 'vercel'),
    '@vercel/build-utils@canary'
  );
  t.is(
    getBuildUtils(['@vercel/static', '@vercel/node@0.8.0'], 'vercel'),
    '@vercel/build-utils@latest'
  );
  t.is(
    getBuildUtils(['@vercel/static', '@vercel/node'], 'vercel'),
    '@vercel/build-utils@latest'
  );
  t.is(
    getBuildUtils(['@vercel/static'], 'vercel'),
    '@vercel/build-utils@latest'
  );
  t.is(
    getBuildUtils(['@vercel/md@canary'], 'vercel'),
    '@vercel/build-utils@canary'
  );
  t.is(
    getBuildUtils(['custom-builder'], 'vercel'),
    '@vercel/build-utils@latest'
  );
  t.is(
    getBuildUtils(['custom-builder@canary'], 'vercel'),
    '@vercel/build-utils@canary'
  );
  t.is(getBuildUtils(['canary-bird'], 'vercel'), '@vercel/build-utils@latest');
  t.is(
    getBuildUtils(['canary-bird@4.0.0'], 'vercel'),
    '@vercel/build-utils@latest'
  );
  t.is(
    getBuildUtils(['canary-bird@canary'], 'vercel'),
    '@vercel/build-utils@canary'
  );
  t.is(getBuildUtils(['@canary/bird'], 'vercel'), '@vercel/build-utils@latest');
  t.is(
    getBuildUtils(['@canary/bird@0.1.0'], 'vercel'),
    '@vercel/build-utils@latest'
  );
  t.is(
    getBuildUtils(['@canary/bird@canary'], 'vercel'),
    '@vercel/build-utils@canary'
  );
  t.is(
    getBuildUtils(['https://example.com'], 'vercel'),
    '@vercel/build-utils@latest'
  );
  t.is(getBuildUtils([''], 'vercel'), '@vercel/build-utils@latest');
});

test(
  '[DevServer] Test default builds and routes',
  testFixture('now-dev-default-builds-and-routes', async (t, server) => {
    let podId;

    {
      const res = await fetch(`${server.address}/`);
      validateResponseHeaders(t, res);
      podId = res.headers.get('x-vercel-id').match(/:(\w+)-/)[1];
      const body = await res.text();
      t.is(body.includes('hello, this is the frontend'), true);
    }

    {
      const res = await fetch(`${server.address}/api/users`);
      validateResponseHeaders(t, res, podId);
      const body = await res.text();
      t.is(body, 'users');
    }

    {
      const res = await fetch(`${server.address}/api/users/1`);
      validateResponseHeaders(t, res, podId);
      const body = await res.text();
      t.is(body, 'users/1');
    }

    {
      const res = await fetch(`${server.address}/api/welcome`);
      validateResponseHeaders(t, res, podId);
      const body = await res.text();
      t.is(body, 'hello and welcome');
    }
  })
);

test(
  '[DevServer] Test `@vercel/static` routing',
  testFixture('now-dev-static-routes', async (t, server) => {
    {
      const res = await fetch(`${server.address}/`);
      t.is(res.status, 200);
      const body = await res.text();
      t.is(body, '<body>Hello!</body>\n');
    }
  })
);

test(
  '[DevServer] Test `@vercel/static-build` routing',
  testFixture('now-dev-static-build-routing', async (t, server) => {
    {
      const res = await fetch(`${server.address}/api/date`);
      t.is(res.status, 200);
      const body = await res.text();
      t.is(body.startsWith('The current date:'), true);
    }
  })
);

test(
  '[DevServer] Test directory listing',
  testFixture('now-dev-directory-listing', async (t, server) => {
    {
      // Get directory listing
      let res = await fetch(`${server.address}/`);
      let body = await res.text();
      t.is(res.status, 200);
      t.truthy(body.includes('Index of'));

      // Get a file
      res = await fetch(`${server.address}/file.txt`);
      body = await res.text();
      t.is(res.status, 200);
      t.is(body, 'Hello from file!\n');

      // Invoke a lambda
      res = await fetch(`${server.address}/lambda.js`);
      body = await res.text();
      t.is(res.status, 200);
      t.is(body, 'Hello from Lambda!');

      // Trigger a 404
      res = await fetch(`${server.address}/does-not-exist`);
      t.is(res.status, 404);
    }
  })
);

test(
  '[DevServer] Test `public` directory with zero config',
  testFixture('now-dev-api-with-public', async (t, server) => {
    {
      const res = await fetch(`${server.address}/api/user`);
      const body = await res.text();
      t.is(body, 'hello:user');
    }

    {
      const res = await fetch(`${server.address}/`);
      const body = await res.text();
      t.is(body.startsWith('<h1>hello world</h1>'), true);
    }
  })
);

test(
  '[DevServer] Test static files with zero config',
  testFixture('now-dev-api-with-static', async (t, server) => {
    {
      const res = await fetch(`${server.address}/api/user`);
      const body = await res.text();
      t.is(body, 'bye:user');
    }

    {
      const res = await fetch(`${server.address}/`);
      const body = await res.text();
      t.is(body.startsWith('<h1>goodbye world</h1>'), true);
    }
  })
);

test(
  '[DevServer] 404 listing',
  testFixture('now-dev-directory-listing', async (t, server) => {
    {
      // HTML response
      const res = await fetch(`${server.address}/does-not-exist`, {
        headers: {
          Accept: 'text/html',
        },
      });
      t.is(res.status, 404);
      t.is(res.headers.get('content-type'), 'text/html; charset=utf-8');
      const body = await res.text();
      t.truthy(body.startsWith('<!DOCTYPE html>'));
    }

    {
      // JSON response
      const res = await fetch(`${server.address}/does-not-exist`, {
        headers: {
          Accept: 'application/json',
        },
      });
      t.is(res.status, 404);
      t.is(res.headers.get('content-type'), 'application/json');
      const body = await res.text();
      t.is(
        body,
        '{"error":{"code":404,"message":"The page could not be found."}}\n'
      );
    }

    {
      // Plain text response
      const res = await fetch(`${server.address}/does-not-exist`);
      t.is(res.status, 404);
      const body = await res.text();
      t.is(res.headers.get('content-type'), 'text/plain; charset=utf-8');
      t.is(body, 'The page could not be found.\n\nNOT_FOUND\n');
    }
  })
);

test(
  '[DevServer] custom 404 routes',
  testFixture('now-dev-custom-404', async (t, server) => {
    {
      // Test custom 404 with static dest
      const res = await fetch(`${server.address}/error.html`);
      t.is(res.status, 404);
      const body = await res.text();
      t.is(body, '<div>Custom 404 page</div>\n');
    }

    {
      // Test custom 404 with lambda dest
      const res = await fetch(`${server.address}/error.js`);
      t.is(res.status, 404);
      const body = await res.text();
      t.is(body, 'Custom 404 Lambda\n');
    }

    {
      // Test regular 404 still works
      const res = await fetch(`${server.address}/does-not-exist`);
      t.is(res.status, 404);
      const body = await res.text();
      t.is(body, 'The page could not be found.\n\nNOT_FOUND\n');
    }
  })
);

test('[DevServer] parseListen()', t => {
  t.deepEqual(parseListen('0'), [0]);
  t.deepEqual(parseListen('3000'), [3000]);
  t.deepEqual(parseListen('0.0.0.0'), [3000, '0.0.0.0']);
  t.deepEqual(parseListen('127.0.0.1:3005'), [3005, '127.0.0.1']);
  t.deepEqual(parseListen('tcp://127.0.0.1:5000'), [5000, '127.0.0.1']);
  if (process.platform !== 'win32') {
    t.deepEqual(parseListen('unix:/home/user/server.sock'), [
      '/home/user/server.sock',
    ]);
    t.deepEqual(parseListen('pipe:\\\\.\\pipe\\PipeName'), [
      '\\\\.\\pipe\\PipeName',
    ]);
  }

  let err;
  try {
    parseListen('bad://url');
  } catch (_err) {
    err = _err;
  }
  t.truthy(err);
  t.is(err.message, 'Unknown `--listen` scheme (protocol): bad:');
});

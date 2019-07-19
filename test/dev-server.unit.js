import url from 'url';
import test from 'ava';
import path from 'path';
import fetch from 'node-fetch';
import listen from 'async-listen';
import { request, createServer } from 'http';
import createOutput from '../src/util/output';
import DevServer from '../src/util/dev/server';
import { installBuilders, getBuildUtils } from '../src/util/dev/builder-cache';

function testFixture(name, fn) {
  return async t => {
    let server;
    try {
      let readyResolve;
      let readyPromise = new Promise(resolve => {
        readyResolve = resolve;
      });

      const debug = false;
      const output = createOutput({ debug });
      const origReady = output.ready;

      output.ready = msg => {
        if (msg.toString().match(/Available at/)) {
          readyResolve();
        }
        origReady(msg);
      };

      const fixturePath = path.join(__dirname, `fixtures/unit/${name}`);
      server = new DevServer(fixturePath, { output, debug });

      await server.start(0);
      await readyPromise;

      await fn(t, server);
    } finally {
      await server.stop();
    }
  };
}

function validateResponseHeaders(t, res) {
  t.is(res.headers.get('x-now-trace'), 'dev1');
  t.truthy(res.headers.get('cache-control').length > 0);
  t.truthy(
    /^dev1:[0-9a-z]{5}-[1-9][0-9]+-[a-f0-9]{12}$/.test(
      res.headers.get('x-now-id')
    )
  );
}

function get(url) {
  return new Promise((resolve, reject) => {
    request(url, resolve).on('error', reject).end();
  });
}

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
    const res = await get(`${server.address}/?name=cache-control&value=immutable`);
    t.is(res.headers['cache-control'], 'immutable');
  })
);

test(
  '[DevServer] Sends `etag` header for static files',
  testFixture('now-dev-headers', async (t, server) => {
    const res = await fetch(`${server.address}/foo.txt`);
    t.is(res.headers.get('etag'), '"55ca6286e3e4f4fba5d0448333fa99fc5a404a73"');
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

test('[DevServer] Installs canary build-utils if one more more builders is canary', async t => {
  t.is(
    getBuildUtils(['@now/static', '@now/node@canary']),
    '@now/build-utils@canary'
  );
  t.is(
    getBuildUtils(['@now/static', '@now/node@0.7.4-canary.0']),
    '@now/build-utils@canary'
  );
  t.is(
    getBuildUtils(['@now/static', '@now/node@0.8.0']),
    '@now/build-utils@latest'
  );
  t.is(getBuildUtils(['@now/static', '@now/node']), '@now/build-utils@latest');
  t.is(getBuildUtils(['@now/static']), '@now/build-utils@latest');
  t.is(getBuildUtils(['@now/md@canary']), '@now/build-utils@canary');
  t.is(getBuildUtils(['custom-builder']), '@now/build-utils@latest');
  t.is(getBuildUtils(['custom-builder@canary']), '@now/build-utils@canary');
  t.is(getBuildUtils(['canary-bird']), '@now/build-utils@latest');
  t.is(getBuildUtils(['canary-bird@4.0.0']), '@now/build-utils@latest');
  t.is(getBuildUtils(['canary-bird@canary']), '@now/build-utils@canary');
  t.is(getBuildUtils(['@canary/bird']), '@now/build-utils@latest');
  t.is(getBuildUtils(['@canary/bird@0.1.0']), '@now/build-utils@latest');
  t.is(getBuildUtils(['@canary/bird@canary']), '@now/build-utils@canary');
  t.is(getBuildUtils(['https://example.com']), '@now/build-utils@latest');
  t.is(getBuildUtils(['']), '@now/build-utils@latest');
});

test(
  '[DevServer] Test default builds and routes',
  testFixture('now-dev-default-builds-and-routes', async (t, server) => {
    {
      const res = await fetch(`${server.address}/`);
      const body = await res.text();
      t.is(body.includes('hello, this is the frontend'), true);
    }

    {
      const res = await fetch(`${server.address}/api/users`);
      const body = await res.text();
      t.is(body, 'users');
    }

    {
      const res = await fetch(`${server.address}/api/users/1`);
      const body = await res.text();
      t.is(body, 'users/1');
    }

    {
      const res = await fetch(`${server.address}/api/welcome`);
      const body = await res.text();
      t.is(body, 'hello and welcome');
    }
  })
);

test(
  '[DevServer] Test `@now/static` routing',
  testFixture('now-dev-static-routes', async (t, server) => {
    {
      const res = await fetch(`${server.address}/`);
      const body = await res.text();
      t.is(body, '<body>Hello!</body>\n');
    }
  })
);

test(
  '[DevServer] Test `@now/static-build` routing',
  testFixture('now-dev-static-build-routing', async (t, server) => {
    {
      const res = await fetch(`${server.address}/api/date`);
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
      res = await fetch(`${server.address}/does-not-exists`);
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

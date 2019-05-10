import url from 'url';
import test from 'ava';
import path from 'path';
import fetch from 'node-fetch';
import listen from 'async-listen';
import { createServer } from 'http';
import createOutput from '../src/util/output';
import DevServer from '../src/commands/dev/lib/dev-server';
import { installBuilders } from '../src/commands/dev/lib/builder-cache';

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
      server.stop();
    }
  };
}

test(
  '[DevServer] Maintains query when invoking lambda',
  testFixture('now-dev-query-invoke', async (t, server) => {
    const res = await fetch(`${server.address}/something?url-param=a`);
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

test('[DevServer] Does not install builders if there are no builds', async t => {
  const handler = data => {
    if (data.includes('installing')) {
      t.fail();
    }
  };

  process.stdout.addListener('data', handler);
  process.stderr.addListener('data', handler);

  await installBuilders(new Set());

  process.stdout.removeListener('data', handler);
  process.stderr.removeListener('data', handler);

  t.pass();
});

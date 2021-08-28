import ms from 'ms';
import url from 'url';
import path from 'path';
import execa from 'execa';
import fs from 'fs-extra';
import fetch, { Response } from 'node-fetch';
import listen from 'async-listen';
import { createServer } from 'http';
import { client } from '../../mocks/client';
import DevServer from '../../../src/util/dev/server';

async function runNpmInstall(fixturePath: string) {
  if (await fs.pathExists(path.join(fixturePath, 'package.json'))) {
    return execa('yarn', ['install'], { cwd: fixturePath, shell: true });
  }
}

const testFixture =
  (name: string, fn: (server: DevServer) => Promise<void>) => async () => {
    let server: DevServer | null = null;
    const fixturePath = path.join(__dirname, '../../fixtures/unit', name);
    await runNpmInstall(fixturePath);
    try {
      server = new DevServer(fixturePath, { output: client.output });
      await server.start(0);
      await fn(server);
    } finally {
      if (server) {
        await server.stop();
      }
    }
  };

function validateResponseHeaders(res: Response, podId?: string) {
  expect(res.headers.get('server')).toEqual('Vercel');
  expect(res.headers.get('cache-control')!.length > 0).toBeTruthy();
  expect(
    /^dev1::(dev1::)?[0-9a-z]{5}-[1-9][0-9]+-[a-f0-9]{12}$/.test(
      res.headers.get('x-vercel-id')!
    )
  ).toBeTruthy();
  if (podId) {
    expect(
      res.headers.get('x-vercel-id')!.startsWith(`dev1::${podId}`) ||
        res.headers.get('x-vercel-id')!.startsWith(`dev1::dev1::${podId}`)
    ).toBeTruthy();
  }
}

describe('DevServer', () => {
  jest.setTimeout(ms('2m'));

  it(
    'should support request body',
    testFixture('now-dev-request-body', async server => {
      const body = { hello: 'world' };

      // Test that `req.body` works in dev
      let res = await fetch(`${server.address}/api/req-body`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      validateResponseHeaders(res);
      expect(await res.json()).toMatchObject(body);

      // Test that `req` "data" events work in dev
      res = await fetch(`${server.address}/api/data-events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      expect(await res.json()).toMatchObject(body);
    })
  );

  it(
    'should maintain query when invoking serverless function',
    testFixture('now-dev-query-invoke', async server => {
      const res = await fetch(`${server.address}/something?url-param=a`);
      validateResponseHeaders(res);

      const text = await res.text();
      const parsed = url.parse(text, true);
      expect(parsed.pathname).toEqual('/something');
      expect(parsed.query['url-param']).toEqual('a');
      expect(parsed.query['route-param']).toEqual('b');
    })
  );

  it(
    'should maintain query when proxy passing',
    testFixture('now-dev-query-proxy', async server => {
      const dest = createServer((req, res) => {
        res.end(req.url);
      });
      await listen(dest, 0);
      const addr = dest.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Unexpected HTTP address');
      }
      const { port } = addr;

      try {
        const res = await fetch(`${server.address}/${port}?url-param=a`);
        validateResponseHeaders(res);

        const text = await res.text();
        const parsed = url.parse(text, true);
        expect(parsed.pathname).toEqual('/something');
        expect(parsed.query['url-param']).toEqual('a');
        expect(parsed.query['route-param']).toEqual('b');
      } finally {
        dest.close();
      }
    })
  );

  it(
    'should maintain query when builder defines routes',
    testFixture('now-dev-next', async server => {
      const res = await fetch(`${server.address}/something?url-param=a`);
      validateResponseHeaders(res);

      const text = await res.text();

      // Hacky way of getting the page payload from the response
      // HTML since we don't have a HTML parser handy.
      const json = text
        .match(/<div>(.*)<\/div>/)![1]
        .replace('</div>', '')
        .replace(/&quot;/g, '"');
      const parsed = JSON.parse(json);

      expect(parsed.query['url-param']).toEqual('a');
      expect(parsed.query['route-param']).toEqual('b');
    })
  );

  it(
    'should allow `cache-control` to be overwritten',
    testFixture('now-dev-headers', async server => {
      const res = await fetch(
        `${server.address}/?name=cache-control&value=immutable`
      );
      expect(res.headers.get('cache-control')).toEqual('immutable');
    })
  );

  it.only(
    'should send `etag` header for static files',
    testFixture('now-dev-headers', async server => {
      const res = await fetch(`${server.address}/foo.txt`);
      expect(res.headers.get('etag')).toEqual(
        '"d263af8ab880c0b97eb6c5c125b5d44f9e5addd9"'
      );
      expect(await res.text()).toEqual('hi\n');
    })
  );

  it(
    'should support default builds and routes',
    testFixture('now-dev-default-builds-and-routes', async server => {
      let podId: string;

      let res = await fetch(`${server.address}/`);
      validateResponseHeaders(res);
      podId = res.headers.get('x-vercel-id')!.match(/:(\w+)-/)![1];
      let body = await res.text();
      expect(body.includes('hello, this is the frontend')).toBeTruthy();

      res = await fetch(`${server.address}/api/users`);
      validateResponseHeaders(res, podId);
      body = await res.text();
      expect(body).toEqual('users');

      res = await fetch(`${server.address}/api/users/1`);
      validateResponseHeaders(res, podId);
      body = await res.text();
      expect(body).toEqual('users/1');

      res = await fetch(`${server.address}/api/welcome`);
      validateResponseHeaders(res, podId);
      body = await res.text();
      expect(body).toEqual('hello and welcome');
    })
  );

  it(
    'should support `@vercel/static` routing',
    testFixture('now-dev-static-routes', async server => {
      const res = await fetch(`${server.address}/`);
      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body.trim()).toEqual('<body>Hello!</body>');
    })
  );

  it.only(
    'should support `@vercel/static-build` routing',
    testFixture('now-dev-static-build-routing', async server => {
      const res = await fetch(`${server.address}/api/date`);
      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body.startsWith('The current date:')).toBeTruthy();
    })
  );

  it(
    'should support directory listing',
    testFixture('now-dev-directory-listing', async server => {
      // Get directory listing
      let res = await fetch(`${server.address}/`);
      let body = await res.text();
      expect(res.status).toEqual(200);
      expect(body.includes('Index of')).toBeTruthy();

      // Get a file
      res = await fetch(`${server.address}/file.txt`);
      body = await res.text();
      expect(res.status).toEqual(200);
      expect(body.trim()).toEqual('Hello from file!');

      // Invoke a lambda
      res = await fetch(`${server.address}/lambda.js`);
      body = await res.text();
      expect(res.status).toEqual(200);
      expect(body).toEqual('Hello from Lambda!');

      // Trigger a 404
      res = await fetch(`${server.address}/does-not-exist`);
      expect(res.status).toEqual(404);
    })
  );

  it(
    'should support `public` directory with zero config',
    testFixture('now-dev-api-with-public', async server => {
      let res = await fetch(`${server.address}/api/user`);
      let body = await res.text();
      expect(body).toEqual('hello:user');

      res = await fetch(`${server.address}/`);
      body = await res.text();
      expect(body.startsWith('<h1>hello world</h1>')).toBeTruthy();
    })
  );

  it(
    'should support static files with zero config',
    testFixture('now-dev-api-with-static', async server => {
      let res = await fetch(`${server.address}/api/user`);
      let body = await res.text();
      expect(body).toEqual('bye:user');

      res = await fetch(`${server.address}/`);
      body = await res.text();
      expect(body.startsWith('<h1>goodbye world</h1>')).toBeTruthy();
    })
  );

  it(
    'should respond with 404 listing with Accept header support',
    testFixture('now-dev-directory-listing', async server => {
      // HTML response
      let res = await fetch(`${server.address}/does-not-exist`, {
        headers: {
          Accept: 'text/html',
        },
      });
      expect(res.status).toEqual(404);
      expect(res.headers.get('content-type')).toEqual(
        'text/html; charset=utf-8'
      );
      let body = await res.text();
      expect(body.startsWith('<!DOCTYPE html>')).toBeTruthy();

      // JSON response
      res = await fetch(`${server.address}/does-not-exist`, {
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
      res = await fetch(`${server.address}/does-not-exist`);
      expect(res.status).toEqual(404);
      body = await res.text();
      expect(res.headers.get('content-type')).toEqual(
        'text/plain; charset=utf-8'
      );
      expect(body).toEqual('The page could not be found.\n\nNOT_FOUND\n');
    })
  );

  it(
    'should support custom 404 routes',
    testFixture('now-dev-custom-404', async server => {
      // Test custom 404 with static dest
      let res = await fetch(`${server.address}/error.html`);
      expect(res.status).toEqual(404);
      let body = await res.text();
      expect(body.trim()).toEqual('<div>Custom 404 page</div>');

      // Test custom 404 with lambda dest
      res = await fetch(`${server.address}/error.js`);
      expect(res.status).toEqual(404);
      body = await res.text();
      expect(body).toEqual('Custom 404 Lambda\n');

      // Test regular 404 still works
      res = await fetch(`${server.address}/does-not-exist`);
      expect(res.status).toEqual(404);
      body = await res.text();
      expect(body).toEqual('The page could not be found.\n\nNOT_FOUND\n');
    })
  );
});

import { join } from 'path';
import { parse } from 'url';
import { promises as fsp } from 'fs';
import { createFunction, Lambda } from '@vercel/fun';
import { HeadersInit, Response } from 'node-fetch';
import { build } from '../src';

interface TestParams {
  fixture: string;
  fetch: (path: string) => Promise<Response>;
}

interface VercelResponsePayload {
  statusCode: number;
  headers: { [name: string]: string };
  encoding: 'base64';
  body: string;
}

function withFixture<T>(
  name: string,
  t: (props: TestParams) => Promise<T>
): () => Promise<T> {
  return async () => {
    const fixture = join(__dirname, 'fixtures', name);
    const functions = new Map<string, Lambda>();

    async function fetch(url: string) {
      const parsed = parse(url);
      const pathWithIndex = join(
        parsed.pathname!,
        parsed.pathname!.endsWith('/index') ? '' : 'index'
      ).substring(1);

      let status = 404;
      let headers: HeadersInit = {};
      let body: string | Buffer = 'Function not found';

      let fn = functions.get(pathWithIndex);
      if (!fn) {
        const manifest = JSON.parse(
          await fsp.readFile(
            join(fixture, '.output/functions-manifest.json'),
            'utf8'
          )
        );
        const functionManifest = manifest.pages[pathWithIndex];
        if (functionManifest) {
          const dir = join(fixture, '.output/server/pages', pathWithIndex);
          fn = await createFunction({
            Code: {
              Directory: dir,
            },
            Handler: functionManifest.handler,
            Runtime: functionManifest.runtime,
          });
          functions.set(pathWithIndex, fn);
        }
      }

      if (fn) {
        const payload: VercelResponsePayload = await fn({
          Action: 'Invoke',
          body: JSON.stringify({
            method: 'GET',
            path: url,
            headers: {},
            //body: string;
          }),
        });
        //console.log({ payload });
        status = payload.statusCode;
        headers = payload.headers;
        body = Buffer.from(payload.body, 'base64');
      }

      return new Response(body, {
        status,
        headers,
      });
    }

    await build({ workPath: fixture });

    try {
      return await t({ fixture, fetch });
    } finally {
      await Promise.all(Array.from(functions.values()).map(f => f.destroy()));
    }
  };
}

describe('build()', () => {
  // Longer timeout to install deps of fixtures
  jest.setTimeout(60 * 1000);

  // Basic test with no dependencies
  // Also tests `req.query`
  it(
    'should build "hello"',
    withFixture('hello', async ({ fetch }) => {
      const res = await fetch('/api/hello');
      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body).toEqual('Hello world!');

      const res2 = await fetch('/api/hello?place=SF');
      expect(res2.status).toEqual(200);
      const body2 = await res2.text();
      expect(body2).toEqual('Hello SF!');
    })
  );

  // Tests a basic dependency with root-level `package.json`
  // and an endpoint in a subdirectory with its own `package.json`
  it(
    'should build "cowsay"',
    withFixture('cowsay', async ({ fetch }) => {
      const res = await fetch('/api');
      expect(res.status).toEqual(200);
      const body = await res.text();
      expect(body).toEqual(
        ' ____________________________\n' +
          '< cow:RANDOMNESS_PLACEHOLDER >\n' +
          ' ----------------------------\n' +
          '        \\   ^__^\n' +
          '         \\  (oo)\\_______\n' +
          '            (__)\\       )\\/\\\n' +
          '                ||----w |\n' +
          '                ||     ||'
      );
    })
  );

  // Tests the legacy Node.js server interface where
  // `server.listen()` is explicitly called
  it(
    'should build "node-server"',
    withFixture('node-server', async ({ fetch }) => {
      const res = await fetch('/api');
      expect(await res.text()).toEqual('root');

      const res2 = await fetch('/api/subdirectory');
      expect(await res2.text()).toEqual('subdir');

      const res3 = await fetch('/api/hapi-async');
      expect(await res3.text()).toEqual('hapi-async');
    })
  );
});

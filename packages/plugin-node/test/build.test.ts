import path from 'path';
import { parse } from 'url';
import { promises as fsp } from 'fs';
import { ZipFile } from 'yazl';
import { createFunction, Lambda } from '@vercel/fun';
import {
  Request,
  HeadersInit,
  RequestInfo,
  RequestInit,
  Response,
  Headers,
} from 'node-fetch';
import { build } from '../src';
import { runNpmInstall, streamToBuffer } from '@vercel/build-utils';

interface TestParams {
  fixture: string;
  fetch: (r: RequestInfo, init?: RequestInit) => Promise<Response>;
}

interface VercelResponsePayload {
  statusCode: number;
  headers: { [name: string]: string };
  encoding?: 'base64';
  body: string;
}

function headersToObject(headers: Headers) {
  const h: { [name: string]: string } = {};
  for (const [name, value] of headers) {
    h[name] = value;
  }
  return h;
}

function toBase64(body?: Buffer | NodeJS.ReadableStream) {
  if (!body) return undefined;
  if (Buffer.isBuffer(body)) {
    return body.toString('base64');
  }
  return new Promise<string>((res, rej) => {
    const buffers: Buffer[] = [];
    body.on('data', b => buffers.push(b));
    body.on('end', () => res(Buffer.concat(buffers).toString('base64')));
    body.on('error', rej);
  });
}

function withFixture<T>(
  name: string,
  t: (props: TestParams) => Promise<T>
): () => Promise<T> {
  return async () => {
    const fixture = path.join(__dirname, 'fixtures', name);
    await fsp.rmdir(path.join(fixture, '.output'), { recursive: true });

    const functions = new Map<string, Lambda>();

    async function fetch(r: RequestInfo, init?: RequestInit) {
      const req = new Request(r, init);
      const url = parse(req.url);
      const functionPath = url.pathname!.substring(1);

      let status = 404;
      let headers: HeadersInit = {};
      let body: string | Buffer = 'Function not found';

      let fn = functions.get(functionPath);
      if (!fn) {
        const manifest = JSON.parse(
          await fsp.readFile(
            path.join(fixture, '.output/functions-manifest.json'),
            'utf8'
          )
        );

        const keyFile = `${functionPath}.js`;
        const keyIndex = `${functionPath}/index.js`;
        const fnKey = keyFile in manifest.pages ? keyFile : keyIndex;
        const functionManifest = manifest.pages[fnKey];

        if (functionManifest) {
          const entry = path.join(fixture, '.output/server/pages', fnKey);
          const nftFile = JSON.parse(
            await fsp.readFile(`${entry}.nft.json`, 'utf8')
          );

          const zip = new ZipFile();
          zip.addFile(
            path.join(fixture, '.output/server/pages', fnKey),
            path.join('.output/server/pages', fnKey)
          );

          nftFile.files.forEach((f: { input: string; output: string }) => {
            const input = path.join(path.dirname(entry), f.input);
            zip.addFile(input, f.output);
          });
          zip.end();

          const handler = path.posix.join(
            '.output/server/pages',
            path.dirname(fnKey),
            functionManifest.handler
          );

          fn = await createFunction({
            Code: {
              ZipFile: await streamToBuffer(zip.outputStream),
            },
            Handler: handler,
            Runtime: functionManifest.runtime,
          });
          functions.set(functionPath, fn);
        }
      }

      if (fn) {
        const payload: VercelResponsePayload = await fn({
          Action: 'Invoke',
          body: JSON.stringify({
            method: req.method,
            path: req.url,
            headers: headersToObject(req.headers),
            body: await toBase64(req.body),
            encoding: 'base64',
          }),
        });
        status = payload.statusCode;
        headers = payload.headers;
        body = Buffer.from(payload.body, payload.encoding || 'utf8');
      }

      return new Response(body, {
        status,
        headers,
      });
    }

    if (
      await fsp.lstat(path.join(fixture, 'package.json')).catch(() => false)
    ) {
      await runNpmInstall(fixture);
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

      const res2 = await fetch('/api/subdirectory');
      expect(res2.status).toEqual(200);
      const body2 = await res2.text();
      expect(body2).toEqual(
        ' _____________________________\n' +
          '< yoda:RANDOMNESS_PLACEHOLDER >\n' +
          ' -----------------------------\n' +
          '      \\\n' +
          '       \\\n' +
          '          .--.\n' +
          "  \\`--._,'.::.`._.--'/\n" +
          "    .  ` __::__ '  .\n" +
          "      -:.`'..`'.:-\n" +
          "        \\ `--' /\n" +
          '          ----\n'
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

  // Tests the importing a `.tsx` file
  it(
    'should build "tsx-resolve"',
    withFixture('tsx-resolve', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      expect(body).toEqual('tsx');
    })
  );

  // Tests that nft includes statically detected asset files
  it(
    'should build "assets"',
    withFixture('assets', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      expect(body).toEqual('asset1,asset2');
    })
  );

  // Tests the `includeFiles` config option
  /* 
  it(
    'should build "include-files"',
    withFixture('include-files', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      expect(body.includes('hello Vercel!')).toEqual(true);

      const res2 = await fetch('/api/include-ts-file');
      const body2 = await res2.text();
      expect(body2.includes("const foo = 'hello TS!'")).toEqual(true);

      const res3 = await fetch('/api/root');
      const body3 = await res3.text();
      expect(body3.includes('hello Root!')).toEqual(true);

      const res4 = await fetch('/api/accepts-string');
      const body4 = await res4.text();
      expect(body4.includes('hello String!')).toEqual(true);
    })
  );
 */

  // Tests the Vercel helper properties / functions
  /* 
  it(
    'should build "helpers"',
    withFixture('helpers', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      expect(body).toEqual('hello anonymous');

      const res2 = await fetch('/api?who=bill');
      const body2 = await res2.text();
      expect(body2).toEqual('hello bill');

      const res3 = await fetch('/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ who: 'john' }),
      });
      const body3 = await res3.text();
      expect(body3).toEqual('hello john');

      const res4 = await fetch('/api', {
        headers: { cookie: 'who=chris' },
      });
      const body4 = await res4.text();
      expect(body4).toEqual('hello chris');

      const res5 = await fetch('/api/ts');
      expect(res5.status).toEqual(404);
      const body5 = await res5.text();
      expect(body5).toEqual('not found');

      const res6 = await fetch('/api/micro-compat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ who: 'katie' }),
      });
      const body6 = await res6.text();
      expect(body6).toEqual('hello katie');

      const res7 = await fetch('/api/no-helpers');
      const body7 = await res7.text();
      expect(body7).toEqual('no');
    })
  );
 */

  // Tests the `awsHandlerName` config option
  /* 
  it(
    'should build "aws-api"',
    withFixture('aws-api', async ({ fetch }) => {
      const res = await fetch('/api');
      const body = await res.text();
      expect(body).toEqual(
        ' ______________\n' +
          '< aws-api-root >\n' +
          ' --------------\n' +
          '        \\   ^__^\n' +
          '         \\  (oo)\\_______\n' +
          '            (__)\\       )\\/\\\n' +
          '                ||----w |\n' +
          '                ||     ||'
      );

      const res2 = await fetch('/api/callback');
      const body2 = await res2.text();
      expect(body2).toEqual(
        ' __________________\n' +
          '< aws-api-callback >\n' +
          ' ------------------\n' +
          '        \\   ^__^\n' +
          '         \\  (oo)\\_______\n' +
          '            (__)\\       )\\/\\\n' +
          '                ||----w |\n' +
          '                ||     ||'
      );

      const res3 = await fetch('/api/graphql');
      const body3 = await res3.text();
      expect(body3.includes('GraphQL Playground')).toEqual(true);
    })
  );
 */

  it(
    'should build "nested-lock-and-build"',
    withFixture('nested-lock-and-build', async ({ fetch }) => {
      const resA = await fetch('/api/users/[id]');

      expect(resA.headers.get('x-date')).toEqual('2021-11-20T20:00:00.000Z');

      const body = await resA.text();
      expect(body).toEqual(
        ' _______________________________\n' +
          '< Hello from /api/users/[id].js >\n' +
          ' -------------------------------\n' +
          '        \\   ^__^\n' +
          '         \\  (oo)\\_______\n' +
          '            (__)\\       )\\/\\\n' +
          '                ||----w |\n' +
          '                ||     ||'
      );

      const resB = await fetch('/api/profile');
      expect(await resB.text()).toEqual('true');
    })
  );
});

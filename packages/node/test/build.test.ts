import { join } from 'path';
import { promises as fsp } from 'fs';
import { createFunction, Lambda } from '@vercel/fun';
import { Response } from 'node-fetch';
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

    async function fetch(path: string) {
      const pathWithIndex = join(
        path,
        path.endsWith('/index') ? '' : 'index'
      ).substring(1);

      let fn = functions.get(pathWithIndex);
      if (!fn) {
        const manifest = JSON.parse(
          await fsp.readFile(
            join(fixture, '.output/functions-manifest.json'),
            'utf8'
          )
        );
        const functionManifest = manifest.pages[pathWithIndex];
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

      const payload: VercelResponsePayload = await fn({
        Action: 'Invoke',
        body: JSON.stringify({
          method: 'GET',
          path,
          headers: {},
          //body: string;
        }),
      });
      //console.log({ payload });

      const res = new Response(Buffer.from(payload.body, 'base64'), {
        status: payload.statusCode,
        headers: payload.headers,
      });
      return res;
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
  it(
    'should build "01-cowsay"',
    withFixture('01-cowsay', async ({ fetch }) => {
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

  //it(
  //  'should build "02-node-server"',
  //  withFixture('02-node-server', async ({ fetch }) => {
  //      const res = await fetch('/api');
  //      console.log(res);
  //      expect(await res.text(), );
  //  })
  //);

  /*
  it('should build "01-cowsay"', async () => {
    const fixture = join(__dirname, 'fixtures', '01-cowsay');
    //await build({ workPath: fixture });
    const fn = await createFunction({
      Code: {
        Directory: `${fixture}/.output/server/pages/api/index`,
      },
      Handler: '___vc/__launcher.launcher',
      Runtime: 'nodejs12.x',
    });
    try {
      const res = await fn({
        Action: 'Invoke',
        body: JSON.stringify({
          method: 'GET',
          path: '/api',
          headers: {},
          //body: string;
        }),
      });
      console.log({ res });
    } finally {
      await fn.destroy();
    }
  });
  */
});

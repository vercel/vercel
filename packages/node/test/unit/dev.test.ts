import { forkDevServer, readMessage } from '../../src/fork-dev-server';
import { resolve, extname } from 'path';
import { fetch } from 'undici';
import { createServer } from 'http';
import { listen } from 'async-listen';
import zlib from 'zlib';
import { promisify } from 'util';

jest.setTimeout(20 * 1000);

const [NODE_MAJOR] = process.versions.node.split('.').map(v => Number(v));

function testForkDevServer(entrypoint: string) {
  const ext = extname(entrypoint);
  const isTypeScript = ext === '.ts';
  const isEsm = ext === '.mjs';
  return forkDevServer({
    printLogs: true,
    maybeTranspile: true,
    config: {
      debug: true,
    },
    isEsm,
    isTypeScript,
    meta: {},
    require_: require,
    tsConfig: undefined,
    workPath: resolve(__dirname, '../dev-fixtures'),
    entrypoint,
    devServerPath: resolve(__dirname, '../../dist/dev-server.mjs'),
  });
}

async function withDevServer(
  entrypoint: string,
  fn: (child: any) => Promise<void>
) {
  const child = testForkDevServer(entrypoint);

  const result = await readMessage(child);
  if (result.state !== 'message') {
    throw new Error('Exited. error: ' + JSON.stringify(result.value));
  }
  const { address, port } = result.value;
  const url = `http://${address}:${port}`;
  return fn(url).finally(() => child.kill(9));
}

const teardown: any = [];

afterAll(async () => {
  for (const fn of teardown) await fn();
});

(NODE_MAJOR < 18 ? describe.skip : describe)('web handlers', () => {
  describe('for node runtime', () => {
    test('exporting GET', () =>
      withDevServer('./web-handlers-node.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'GET',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using GET',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using GET',
        });
      }));

    test('exporting POST', () =>
      withDevServer('./web-handlers-node.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'POST',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using POST',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using POST',
        });
      }));

    test('exporting DELETE', () =>
      withDevServer('./web-handlers-node.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'DELETE',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using DELETE',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using DELETE',
        });
      }));

    test('exporting PUT', () =>
      withDevServer('./web-handlers-node.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'PUT',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using PUT',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using PUT',
        });
      }));

    test('exporting PATCH', () =>
      withDevServer('./web-handlers-node.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'PATCH',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using PATCH',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using PATCH',
        });
      }));

    test('exporting HEAD', () =>
      withDevServer('./web-handlers-node.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'HEAD',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: '',
          transferEncoding: null,
          'x-web-handler': 'Web handler using HEAD',
        });
      }));

    test('exporting OPTIONS', () =>
      withDevServer('./web-handlers-node.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'OPTIONS',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using OPTIONS',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using OPTIONS',
        });
      }));

    test('buffer fetch response correctly', () =>
      withDevServer('./serverless-fetch.js', async (url: string) => {
        const server = createServer((req, res) => {
          res.setHeader('Content-Encoding', 'br');
          const searchParams = new URLSearchParams(req.url!.substring(1));
          const encoding = searchParams.get('encoding') ?? 'identity';
          console.log({ encoding });
          res.writeHead(200, {
            'content-type': 'text/plain',
            'content-encoding': encoding,
          });
          let payload = Buffer.from('Greetings, Vercel');

          if (encoding === 'br') {
            console.log('is here');
            payload = zlib.brotliCompressSync(payload, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 0,
              },
            });
            console.log('payload', payload);
          } else if (encoding === 'gzip') {
            payload = zlib.gzipSync(payload, {
              level: zlib.constants.Z_BEST_SPEED,
            });
          } else if (encoding === 'deflate') {
            payload = zlib.deflateSync(payload, {
              level: zlib.constants.Z_BEST_SPEED,
            });
          }

          res.end(payload);
        });

        const serverUrl = (await listen(server)).toString();
        teardown.push(promisify(server.close.bind(server)));

        {
          const response = await fetch(
            `${url}/api/serverless-fetch?url=${serverUrl}&encoding=br`
          );

          console.log(Object.fromEntries(response.headers));
          expect(response.headers.get('content-encoding')).toBe('br');
          // expect(response.headers.get('content-length')).toBe('21');
          // expect({
          //   status: response.status,
          //   body: await response.text(),
          // }).toEqual({ status: 200, body: 'Greetings, Vercel' });
        }

        // {
        //   const response = await fetch(
        //     `${url}/api/serverless-fetch?url=${serverUrl}&encoding=gzip`
        //   );
        //   expect(response.headers.get('content-encoding')).toBe('gzip');
        //   expect(response.headers.get('content-length')).toBe('37');
        //   expect({
        //     status: response.status,
        //     body: await response.text(),
        //   }).toEqual({ status: 200, body: 'Greetings, Vercel' });
        // }
        // {
        //   const response = await fetch(
        //     `${url}/api/serverless-fetch?url=${serverUrl}&encoding=deflate`
        //   );
        //   expect(response.headers.get('content-encoding')).toBe('deflate');
        //   expect(response.headers.get('content-length')).toBe('25');
        //   expect({
        //     status: response.status,
        //     body: await response.text(),
        //   }).toEqual({ status: 200, body: 'Greetings, Vercel' });
        // }
      }));
  });

  describe('for edge runtime', () => {
    test("user code doesn't interfere with runtime", () =>
      withDevServer('./edge-self.js', async (url: string) => {
        const response = await fetch(`${url}/api/edge-self`);
        expect({
          status: response.status,
        }).toEqual({
          status: 200,
        });
      }));

    test('with `WebSocket`', () =>
      withDevServer('./edge-websocket.js', async (url: string) => {
        const response = await fetch(`${url}/api/edge-websocket`);
        expect({
          status: response.status,
          body: await response.text(),
        }).toEqual({
          status: 200,
          body: '3210',
        });
      }));

    test('with `Buffer`', () =>
      withDevServer('./edge-buffer.js', async (url: string) => {
        const response = await fetch(`${url}/api/edge-buffer`);
        expect({
          status: response.status,
          json: await response.json(),
        }).toEqual({
          status: 200,
          json: {
            encoded: Buffer.from('Hello, world!').toString('base64'),
            'Buffer === B.Buffer': true,
          },
        });
      }));

    test('runs a mjs endpoint', () =>
      withDevServer('./esm-module.mjs', async (url: string) => {
        const response = await fetch(`${url}/api/hello`);
        expect({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          text: await response.text(),
        }).toEqual({
          status: 200,
          headers: expect.objectContaining({
            'x-hello': 'world',
          }),
          text: 'Hello, world!',
        });
      }));
    (process.platform === 'win32' ? test.skip : test)(
      'runs a esm typescript endpoint',
      () =>
        withDevServer('./esm-module.ts', async (url: string) => {
          const response = await fetch(`${url}/api/hello`);
          expect({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            text: await response.text(),
          }).toEqual({
            status: 200,
            headers: expect.objectContaining({
              'x-hello': 'world',
            }),
            text: 'Hello, world!',
          });
        })
    );
    (process.platform === 'win32' ? test.skip : test)(
      'allow setting multiple cookies with same name',
      () =>
        withDevServer('./multiple-cookies.ts', async (url: string) => {
          const response = await fetch(`${url}/api/hello`, { method: 'GET' });
          expect({
            status: response.status,
            text: await response.text(),
          }).toEqual({
            status: 200,
            text: 'Hello, world!',
          });
          expect(response.headers.getSetCookie()).toEqual([
            'a=x',
            'b=y',
            'c=z',
          ]);
        })
    );

    test('exporting GET', () =>
      withDevServer('./web-handlers-edge.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'GET',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using GET',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using GET',
        });
      }));

    test('exporting POST', () =>
      withDevServer('./web-handlers-edge.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'POST',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using POST',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using POST',
        });
      }));

    test('exporting DELETE', () =>
      withDevServer('./web-handlers-edge.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'DELETE',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using DELETE',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using DELETE',
        });
      }));

    test('exporting PUT', () =>
      withDevServer('./web-handlers-edge.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'PUT',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using PUT',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using PUT',
        });
      }));

    test('exporting PATCH', () =>
      withDevServer('./web-handlers-edge.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'PATCH',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using PATCH',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using PATCH',
        });
      }));

    test('exporting HEAD', () =>
      withDevServer('./web-handlers-edge.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'HEAD',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: '',
          transferEncoding: null,
          'x-web-handler': 'Web handler using HEAD',
        });
      }));

    test('exporting OPTIONS', () =>
      withDevServer('./web-handlers-edge.js', async (url: string) => {
        const response = await fetch(`${url}/api/web-handlers-node`, {
          method: 'OPTIONS',
        });
        expect({
          status: response.status,
          body: await response.text(),
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          body: 'Web handler using OPTIONS',
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using OPTIONS',
        });
      }));
  });
});

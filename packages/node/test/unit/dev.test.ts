import { afterAll, describe, expect, test, vi } from 'vitest';
import { forkDevServer, readMessage } from '../../src/fork-dev-server';
import { resolve, extname } from 'path';
import { createServer } from 'http';
import { listen } from 'async-listen';
import { once } from 'node:events';
import { fetch } from 'undici';
import { promisify } from 'util';
import { setTimeout } from 'timers/promises';

vi.setConfig({ testTimeout: 20 * 1000 });

const [NODE_MAJOR] = process.versions.node.split('.').map(v => Number(v));

function testForkDevServer(entrypoint: string) {
  const ext = extname(entrypoint);
  const isTypeScript = ext === '.ts';
  const isEsm = ext === '.mjs';
  return forkDevServer({
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

const teardown: any = [];
afterAll(() => Promise.all(teardown.map((fn: any) => fn())));

async function withHttpServer(hander: (req: any, res: any) => void) {
  const server = createServer(hander);
  teardown.push(promisify(server.close.bind(server)));
  const address = await listen(server, { port: 0, host: '127.0.0.1' });
  return address.toString();
}

async function withDevServer(
  entrypoint: string,
  fn: (url: string) => Promise<void>,
  { runningTimeout }: { runningTimeout?: number } = {}
) {
  const child = testForkDevServer(entrypoint);

  const result = await readMessage(child);
  if (result.state !== 'message') {
    throw new Error('Exited. error: ' + JSON.stringify(result.value));
  }
  const { address, port } = result.value;
  const url = `http://${address}:${port}`;

  const start = Date.now();

  try {
    return await fn(url);
  } finally {
    const elapsed = Date.now() - start;
    if (runningTimeout) await setTimeout(runningTimeout - elapsed);
    child.send('shutdown', error => {
      if (error) {
        console.log('Shutdown error:', error);
        try {
          child.kill(9);
        } catch (error) {
          // In Node 22, there's a bug where attempting to kill a child process
          // results in an EPERM error. Ignore the error in that case.
          // See: https://github.com/nodejs/node/issues/51766
          console.log('Ignoring kill error:', error);
        }
      }
    });
    if (child.exitCode === null) await once(child, 'exit');
  }
}

(NODE_MAJOR < 18 ? describe.skip : describe)('web handlers', () => {
  describe('for node runtime', () => {
    test('with `waitUntil` from import', () =>
      withDevServer(
        './wait-until-node.js',
        async (url: string) => {
          let isWaitUntilCalled = false;
          const serverUrl = await withHttpServer((_, res) => {
            isWaitUntilCalled = true;
            res.end();
          });
          await fetch(`${url}/api/wait-until-node?url=${serverUrl}`);
          await setTimeout(50); // wait a bit for waitUntil resolution
          expect(isWaitUntilCalled).toBe(true);
        },
        { runningTimeout: 300 }
      ));

    test('with `waitUntil` from context', () =>
      withDevServer(
        './wait-until-ctx-node.js',
        async (url: string) => {
          let isWaitUntilCalled = false;
          const serverUrl = await withHttpServer((_, res) => {
            isWaitUntilCalled = true;
            res.end();
          });
          const response = await fetch(
            `${url}/api/wait-until-ctx-node?url=${serverUrl}`
          );
          expect(await response.json()).toEqual({ keys: ['waitUntil'] });
          await setTimeout(50); // wait a bit for waitUntil resolution
          expect(isWaitUntilCalled).toBe(true);
        },
        { runningTimeout: 300 }
      ));

    // eslint-disable-next-line jest/no-disabled-tests
    test.skip('with `waitUntil` from context rejecting a promise ', () =>
      withDevServer(
        './wait-until-ctx-node-rejected.js',
        async (url: string) => {
          const response = await fetch(
            `${url}/api/wait-until-ctx-node-rejected`
          );
          await setTimeout(100); // wait a bit for waitUntil resolution
          expect(response.status).toBe(200);
        },
        { runningTimeout: 100 }
      ));

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
  });

  describe('for edge runtime', () => {
    test('with `waitUntil` from import', () =>
      withDevServer(
        './wait-until-edge.js',
        async (url: string) => {
          let isWaitUntilCalled = false;
          const serverUrl = await withHttpServer((_, res) => {
            isWaitUntilCalled = true;
            res.end();
          });
          await fetch(`${url}/api/wait-until-edge?url=${serverUrl}`);
          await setTimeout(50); // wait a bit for waitUntil resolution
          expect(isWaitUntilCalled).toBe(true);
        },
        { runningTimeout: 300 }
      ));

    test('with `waitUntil` from context', () =>
      withDevServer(
        './wait-until-ctx-edge.js',
        async (url: string) => {
          let isWaitUntilCalled = false;
          const serverUrl = await withHttpServer((_, res) => {
            isWaitUntilCalled = true;
            res.end();
          });
          const response = await fetch(
            `${url}/api/wait-until-ctx-edge?url=${serverUrl}`
          );
          expect(await response.json()).toEqual({ keys: ['waitUntil'] });
          await setTimeout(50); // wait a bit for waitUntil resolution
          expect(isWaitUntilCalled).toBe(true);
        },
        { runningTimeout: 300 }
      ));

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

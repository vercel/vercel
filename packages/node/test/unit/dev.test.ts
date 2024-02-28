import { forkDevServer, readMessage } from '../../src/fork-dev-server';
import { resolve, extname } from 'path';
import { fetch } from 'undici';
import { createServer, request } from 'http';
import { listen } from 'async-listen';
import zlib from 'zlib';

jest.setTimeout(20 * 1000);

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

(NODE_MAJOR < 18 ? test.skip : test)(
  'web handlers for node runtime',
  async () => {
    const child = testForkDevServer('./web-handlers-node.js');
    try {
      const result = await readMessage(child);
      if (result.state !== 'message') {
        throw new Error('Exited. error: ' + JSON.stringify(result.value));
      }

      const { address, port } = result.value;

      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-node`,
          { method: 'GET' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-node`,
          { method: 'POST' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-node`,
          { method: 'DELETE' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-node`,
          { method: 'PUT' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-node`,
          { method: 'PATCH' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-node`,
          { method: 'HEAD' }
        );
        expect({
          status: response.status,
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          'x-web-handler': 'Web handler using HEAD',
        });
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-node`,
          { method: 'OPTIONS' }
        );
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
      }
    } finally {
      child.kill(9);
    }
  }
);

(NODE_MAJOR < 18 ? test.skip : test)(
  'web handlers for edge runtime',
  async () => {
    const child = testForkDevServer('./web-handlers-edge.js');
    try {
      const result = await readMessage(child);
      if (result.state !== 'message') {
        throw new Error('Exited. error: ' + JSON.stringify(result.value));
      }

      const { address, port } = result.value;

      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-edge`,
          { method: 'GET' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-edge`,
          { method: 'POST' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-edge`,
          { method: 'DELETE' }
        );

        console.log(response);
        expect({
          status: response.status,
          transferEncoding: response.headers.get('transfer-encoding'),
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          transferEncoding: 'chunked',
          'x-web-handler': 'Web handler using DELETE',
        });
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-edge`,
          { method: 'PUT' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-edge`,
          { method: 'PATCH' }
        );
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
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-edge`,
          { method: 'HEAD' }
        );
        expect({
          status: response.status,
          'x-web-handler': response.headers.get('x-web-handler'),
        }).toEqual({
          status: 200,
          'x-web-handler': 'Web handler using HEAD',
        });
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/web-handlers-edge`,
          { method: 'OPTIONS' }
        );
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
      }
    } finally {
      child.kill(9);
    }
  }
);

(NODE_MAJOR < 18 ? test.skip : test)(
  'buffer fetch response correctly',
  async () => {
    const child = testForkDevServer('./serverless-fetch.js');

    const server = createServer((req, res) => {
      res.setHeader('Content-Encoding', 'br');
      const searchParams = new URLSearchParams(req.url!.substring(1));
      const encoding = searchParams.get('encoding') ?? 'identity';
      res.writeHead(200, {
        'content-type': 'text/plain',
        'content-encoding': encoding,
      });
      let payload = Buffer.from('Greetings, Vercel');

      if (encoding === 'br') {
        payload = zlib.brotliCompressSync(payload, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 0,
          },
        });
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

    try {
      const result = await readMessage(child);
      if (result.state !== 'message') {
        throw new Error('Exited. error: ' + JSON.stringify(result.value));
      }

      const { address, port } = result.value;

      {
        const response = await fetch(
          `http://${address}:${port}/api/serverless-fetch?url=${serverUrl}&encoding=br`
        );
        expect(response.headers.get('content-encoding')).toBe('br');
        expect(response.headers.get('content-length')).toBe('21');
        expect({
          status: response.status,
          body: await response.text(),
        }).toEqual({ status: 200, body: 'Greetings, Vercel' });
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/serverless-fetch?url=${serverUrl}&encoding=gzip`
        );
        expect(response.headers.get('content-encoding')).toBe('gzip');
        expect(response.headers.get('content-length')).toBe('37');
        expect({
          status: response.status,
          body: await response.text(),
        }).toEqual({ status: 200, body: 'Greetings, Vercel' });
      }
      {
        const response = await fetch(
          `http://${address}:${port}/api/serverless-fetch?url=${serverUrl}&encoding=deflate`
        );
        expect(response.headers.get('content-encoding')).toBe('deflate');
        expect(response.headers.get('content-length')).toBe('25');
        expect({
          status: response.status,
          body: await response.text(),
        }).toEqual({ status: 200, body: 'Greetings, Vercel' });
      }
    } finally {
      server.close();
      child.kill(9);
    }
  }
);

test("user code doesn't interfere with runtime", async () => {
  const child = testForkDevServer('./edge-self.js');
  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const { address, port } = result.value;
    const response = await fetch(`http://${address}:${port}/api/edge-self`);

    expect({
      status: response.status,
    }).toEqual({
      status: 200,
    });
  } finally {
    child.kill(9);
  }
});

test('runs an edge function that uses `WebSocket`', async () => {
  const child = testForkDevServer('./edge-websocket.js');
  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const { address, port } = result.value;
    const response = await fetch(
      `http://${address}:${port}/api/edge-websocket`
    );

    expect({
      status: response.status,
      body: await response.text(),
    }).toEqual({
      status: 200,
      body: '3210',
    });
  } finally {
    child.kill(9);
  }
});

test('runs an edge function that uses `buffer`', async () => {
  const child = testForkDevServer('./edge-buffer.js');
  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const { address, port } = result.value;
    const response = await fetch(`http://${address}:${port}/api/edge-buffer`);
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
  } finally {
    child.kill(9);
  }
});

test('runs a mjs endpoint', async () => {
  const child = testForkDevServer('./esm-module.mjs');

  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const { address, port } = result.value;
    const response = await fetch(`http://${address}:${port}/api/hello`);
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
  } finally {
    child.kill(9);
  }
});

test('runs a esm typescript endpoint', async () => {
  if (process.platform === 'win32') {
    console.log('Skipping test on Windows');
    return;
  }

  const child = testForkDevServer('./esm-module.ts');

  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const { address, port } = result.value;
    const response = await fetch(`http://${address}:${port}/api/hello`);
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
  } finally {
    child.kill(9);
  }
});

test('allow setting multiple cookies with same name', async () => {
  if (process.platform === 'win32') {
    console.log('Skipping test on Windows');
    return;
  }

  const child = testForkDevServer('./multiple-cookies.ts');

  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error(`Exited. error: ${JSON.stringify(result.value)}`);
    }

    const { address, port } = result.value;
    const response = await fetch(`http://${address}:${port}/api/hello`);
    expect({
      status: response.status,
      text: await response.text(),
    }).toEqual({
      status: 200,
      text: 'Hello, world!',
    });

    expect(response.headers.getSetCookie()).toEqual(['a=x', 'b=y', 'c=z']);
  } finally {
    child.kill(9);
  }
});

test('dev server waits for waitUntil promises to resolve', async () => {
  async function startPingServer() {
    let resolve: (value: any) => void;
    const promise = new Promise<void>(resolve_ => {
      resolve = resolve_;
    });

    const pingServer = createServer((req, res) => {
      res.end('pong');
      resolve('got a fetch from waitUntil');
    });

    const pingUrl = (await listen(pingServer)).toString();
    return {
      pingUrl,
      pingServer,
      promise,
    };
  }

  async function withTimeout(
    promise: Promise<unknown>,
    name: string,
    ms: number
  ) {
    return await Promise.race([
      promise,
      new Promise(resolve =>
        setTimeout(
          () => resolve(`${name} promise was not resolved in ${ms} ms`),
          ms
        )
      ),
    ]);
  }

  const { promise: pingPromise, pingServer, pingUrl } = await startPingServer();
  const child = testForkDevServer('./edge-waituntil.js');
  const exitPromise = new Promise(resolve => {
    child.on('exit', code => {
      resolve(`child has exited with ${code}`);
    });
  });

  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const { address, port } = result.value;
    const response = await fetch(
      `http://${address}:${port}/api/edge-waituntil`,
      {
        headers: {
          'x-ping-url': pingUrl,
        },
      }
    );

    expect({
      status: response.status,
      body: await response.text(),
    }).toEqual({
      status: 200,
      body: 'running waitUntil promises asynchronously...',
    });

    // Dev server should keep running until waitUntil promise resolves...
    child.send('shutdown');

    // Wait for waitUntil promise to resolve...
    expect(await withTimeout(pingPromise, 'ping server', 3000)).toBe(
      'got a fetch from waitUntil'
    );
    // Make sure child process has exited.
    expect(await withTimeout(exitPromise, 'child exit', 5000)).toBe(
      'child has exited with 0'
    );
  } finally {
    child.kill(9);
    pingServer.close();
  }
});

test('dev server should remove transfer encoding header', async () => {
  expect.assertions(2);
  const child = testForkDevServer('./edge-echo.js');
  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const { address, port } = result.value;
    let resResolve, resReject;
    const resPromise = new Promise((resolve, reject) => {
      resResolve = resolve;
      resReject = reject;
    });
    // Undici will throw if we set Transfer-Encoding, we must use http.request
    const req = request(`http://${address}:${port}/api/edge-echo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    req.once('response', res => {
      expect(res.statusCode).toEqual(200);
      res.setEncoding('utf-8');
      res.on('data', chunk => {
        expect(chunk).toEqual('Hello!');
      });
      res.on('error', resReject!);
      res.on('end', resResolve!);
    });
    req.on('error', resReject!);
    req.flushHeaders();
    req.write('Hello!');
    req.end();
    await resPromise;
  } finally {
    child.kill(9);
  }
});

import { forkDevServer, readMessage } from '../../src/fork-dev-server';
import { resolve, extname } from 'path';
import fetch from 'node-fetch';
import { createServer } from 'http';
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
  'runs an serverless function that exports GET',
  async () => {
    const child = testForkDevServer('./serverless-response.js');
    try {
      const result = await readMessage(child);
      if (result.state !== 'message') {
        throw new Error('Exited. error: ' + JSON.stringify(result.value));
      }

      const { address, port } = result.value;

      {
        const response = await fetch(
          `http://${address}:${port}/api/serverless-response?name=Vercel`
        );
        expect({
          status: response.status,
          body: await response.text(),
        }).toEqual({ status: 200, body: 'Greetings, Vercel' });
      }

      {
        const response = await fetch(
          `http://${address}:${port}/api/serverless-response?name=Vercel`,
          { method: 'HEAD' }
        );
        expect({ status: response.status }).toEqual({ status: 405 });
      }
    } finally {
      child.kill(9);
    }
  }
);

(NODE_MAJOR < 18 ? test.skip : test.only)(
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

    expect(response.headers.raw()['set-cookie']).toEqual(['a=x', 'b=y', 'c=z']);
  } finally {
    child.kill(9);
  }
});

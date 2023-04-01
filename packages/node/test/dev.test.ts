import http from 'http';
import { forkDevServer, readMessage } from '../src/fork-dev-server';
import { resolve, extname } from 'path';

jest.setTimeout(10 * 1000);

function testForkDevServer(entrypoint: string) {
  const ext = extname(entrypoint);
  const isTypeScript = ext === '.ts';
  const isEsm = ext === '.mjs';
  return forkDevServer({
    maybeTranspile: true,
    config: {},
    isEsm,
    isTypeScript,
    meta: {},
    require_: require,
    tsConfig: undefined,
    workPath: resolve(__dirname, './dev-fixtures'),
    entrypoint,
    devServerPath: resolve(__dirname, '../dist/dev-server.mjs'),
  });
}

interface FetchResponse {
  headers: http.IncomingHttpHeaders;
  json: () => Promise<any>;
  status: number | undefined;
  text: string;
}

/**
 * This is a minimal replacement for `node-fetch`. We cannot use the real
 * `node-fetch` because it is a ESM package and Jest doesn't support
 * statically or dynamically importing ESM packages.
 */
async function fetch(url: string): Promise<FetchResponse> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(
              new Error(
                `Fetch dist-tags failed ${res.statusCode} ${res.statusMessage}`
              )
            );
          }

          const response = {
            headers: res.headers,
            status: res.statusCode,
            text: buf,
            async json(): Promise<any> {
              return JSON.parse(buf);
            },
          };

          resolve(response);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('runs an edge function that uses `buffer`', async () => {
  const child = testForkDevServer('./edge-buffer.js');

  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const response = await fetch(
      `http://localhost:${result.value.port}/api/edge-buffer`
    );
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

    const response = await fetch(
      `http://localhost:${result.value.port}/api/hello`
    );
    expect(response.status).toEqual(200);
    expect(response.headers).toEqual(
      expect.objectContaining({
        'x-hello': 'world',
      })
    );
    expect(response.text).toEqual('Hello, world!');
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

    const response = await fetch(
      `http://localhost:${result.value.port}/api/hello`
    );
    expect(response.status).toEqual(200);
    expect(response.headers).toEqual(
      expect.objectContaining({
        'x-hello': 'world',
      })
    );
    expect(response.text).toEqual('Hello, world!');
  } finally {
    child.kill(9);
  }
});

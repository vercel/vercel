import { forkDevServer, readMessage } from '../../src/fork-dev-server';
import { resolve, extname } from 'path';
import fetch from 'node-fetch';

jest.setTimeout(20 * 1000);

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

test('runs an serverless function that exports GET', async () => {
  const child = testForkDevServer('./serverless-web.js');
  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const { address, port } = result.value;
    const response = await fetch(
      `http://${address}:${port}/api/serverless-web?name=Vercel`
    );

    expect({
      status: response.status,
      body: await response.text(),
    }).toEqual({
      status: 200,
      body: 'Greetings, Vercel',
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

    expect(response.headers.raw()['set-cookie']).toEqual(['a=x', 'b=y', 'c=z']);
  } finally {
    child.kill(9);
  }
});

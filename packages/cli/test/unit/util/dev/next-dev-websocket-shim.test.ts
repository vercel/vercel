import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shimPath = resolve(
  process.cwd(),
  'src/util/dev/next-dev-websocket-shim.cjs'
);

async function runShimScenario(scenario: string) {
  const child = spawn(process.execPath, ['-e', childScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SCENARIO: scenario,
      SHIM_PATH: shimPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });

  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
  }, 10_000);

  const exitCode = await new Promise<number | null>(resolve => {
    child.on('close', code => resolve(code));
  });
  clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(`scenario ${scenario} failed: ${stderr || stdout}`);
  }

  return JSON.parse(stdout.trim());
}

describe('next dev websocket shim', () => {
  it('does not expose upgradeWebSocket for normal HTTP requests', async () => {
    await expect(runShimScenario('non-upgrade')).resolves.toMatchObject({
      upgradeWebSocket: false,
    });
  });

  it('exposes upgradeWebSocket for websocket upgrade requests', async () => {
    await expect(runShimScenario('upgrade-present')).resolves.toMatchObject({
      upgradeWebSocket: true,
    });
  });

  it('supports a websocket 101 handshake through request context', async () => {
    await expect(runShimScenario('handshake')).resolves.toMatchObject({
      status: 'HTTP/1.1 101 Switching Protocols',
      message: 'ok',
    });
  });

  it('accepts comma-separated Connection upgrade headers', async () => {
    await expect(runShimScenario('connection-list')).resolves.toMatchObject({
      status: 'HTTP/1.1 101 Switching Protocols',
      message: 'ok',
    });
  });

  it('throws when upgradeWebSocket is called twice', async () => {
    await expect(runShimScenario('double-call')).resolves.toMatchObject({
      message: expect.stringContaining(
        'ctx.upgradeWebSocket() can only be called once per request'
      ),
    });
  });

  it("propagates request context into socket.on('data') listeners", async () => {
    await expect(runShimScenario('socket-data-context')).resolves.toMatchObject(
      {
        message: 'context',
      }
    );
  });

  it('aborts the request signal and emits aborted when the socket closes', async () => {
    await expect(runShimScenario('abort-on-close')).resolves.toMatchObject({
      aborted: 1,
      signalAborted: true,
    });
  });

  it('keeps concurrent websocket request contexts isolated', async () => {
    await expect(runShimScenario('concurrent-context')).resolves.toMatchObject({
      messages: ['/ws?id=1', '/ws?id=2'],
    });
  });

  it('does not intercept Next internal upgrade requests', async () => {
    await expect(runShimScenario('next-internal')).resolves.toMatchObject({
      body: 'internal-upgrade',
      requestHandlerCalled: false,
    });
  });
});

const childScript = String.raw`
const http = require('node:http');
const net = require('node:net');
const { createHash, randomBytes } = require('node:crypto');

require(process.env.SHIM_PATH);

const scenario = process.env.SCENARIO;
const requestContextSymbol = Symbol.for('@vercel/request-context');
const websocketGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let finished = false;

function finish(result) {
  if (finished) return;
  finished = true;
  console.log(JSON.stringify(result));
  server.close(() => process.exit(0));
}

function fail(error) {
  console.error(error && error.stack ? error.stack : error);
  server.close(() => process.exit(1));
}

function getContext() {
  return globalThis[requestContextSymbol].get();
}

function websocketAccept(key) {
  return createHash('sha1').update(key + websocketGuid).digest('base64');
}

function textFrame(message) {
  const payload = Buffer.from(message);
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function readTextFrame(buffer) {
  const length = buffer[1] & 0x7f;
  return buffer.subarray(2, 2 + length).toString('utf8');
}

function writeHandshake(req, socket) {
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + websocketAccept(req.headers['sec-websocket-key']),
    '',
    '',
  ].join('\r\n'));
}

function consumeUpgrade() {
  const ctx = getContext();
  const upgrade = ctx.upgradeWebSocket();
  writeHandshake(upgrade.req, upgrade.socket);
  return { ctx, ...upgrade };
}

const server = http.createServer((req, res) => {
  try {
    const ctx = getContext();

    if (scenario === 'non-upgrade') {
      res.setHeader('connection', 'close');
      res.end(JSON.stringify({
        upgradeWebSocket: typeof ctx.upgradeWebSocket === 'function',
      }));
      return;
    }

    if (scenario === 'upgrade-present') {
      const { socket } = consumeUpgrade();
      socket.end(
        textFrame(
          JSON.stringify({
            upgradeWebSocket: typeof ctx.upgradeWebSocket === 'function',
          })
        )
      );
      return;
    }

    if (scenario === 'handshake' || scenario === 'connection-list') {
      const { socket } = consumeUpgrade();
      socket.end(textFrame('ok'));
      return;
    }

    if (scenario === 'double-call') {
      const { socket } = consumeUpgrade();
      try {
        ctx.upgradeWebSocket();
      } catch (error) {
        socket.end(textFrame(error.message));
      }
      return;
    }

    if (scenario === 'socket-data-context') {
      const { socket } = consumeUpgrade();
      socket.once('data', () => {
        const store = getContext();
        socket.end(textFrame(store.url.endsWith('/ws') ? 'context' : 'missing'));
      });
      return;
    }

    if (scenario === 'abort-on-close') {
      const { ctx, req, socket } = consumeUpgrade();
      const result = { aborted: 0, signalAborted: false };
      req.on('aborted', () => {
        result.aborted += 1;
      });
      ctx.signal.addEventListener('abort', () => {
        result.signalAborted = true;
      });
      socket.once('close', () => {
        setTimeout(() => finish(result), 10);
      });
      setTimeout(() => socket.destroy(), 10);
      return;
    }

    if (scenario === 'concurrent-context') {
      const { req: rawReq, socket } = consumeUpgrade();
      socket.end(textFrame(new URL(rawReq.url, 'http://localhost').pathname + new URL(rawReq.url, 'http://localhost').search));
      return;
    }

    if (scenario === 'next-internal') {
      res.end('request-handler');
      return;
    }

    throw new Error('unknown scenario ' + scenario);
  } catch (error) {
    fail(error);
  }
});

let requestHandlerCalled = false;
server.on('request', () => {
  if (scenario === 'next-internal') requestHandlerCalled = true;
});

server.on('upgrade', (req, socket) => {
  if (scenario !== 'next-internal') return;
  socket.end('internal-upgrade');
});

server.listen(0, '127.0.0.1', async () => {
  try {
    const port = server.address().port;

    if (scenario === 'non-upgrade') {
      const response = await httpRequest(port, '/ws');
      finish(JSON.parse(response.body));
      return;
    }

    if (scenario === 'concurrent-context') {
      const results = await Promise.all([
        websocketRequest(port, '/ws?id=1'),
        websocketRequest(port, '/ws?id=2'),
      ]);
      finish({ messages: results.map(result => result.message).sort() });
      return;
    }

    if (scenario === 'abort-on-close') {
      const client = net.createConnection({ host: '127.0.0.1', port });
      await once(client, 'connect');
      client.write(upgradeRequest('/ws'));
      return;
    }

    if (scenario === 'next-internal') {
      const body = await rawUpgradeBody(port, '/_next/webpack-hmr');
      finish({ body, requestHandlerCalled });
      return;
    }

    const result = await websocketRequest(port, '/ws', {
      connection:
        scenario === 'connection-list' ? 'keep-alive, Upgrade' : 'Upgrade',
      sendAfterUpgrade: scenario === 'socket-data-context' ? Buffer.from('x') : undefined,
    });

    if (scenario === 'upgrade-present') {
      finish(JSON.parse(result.message));
    } else {
      finish(result);
    }
  } catch (error) {
    fail(error);
  }
});

function once(emitter, event) {
  return new Promise((resolve, reject) => {
    emitter.once(event, resolve);
    emitter.once('error', reject);
  });
}

function httpRequest(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

function upgradeRequest(path, options = {}) {
  const key = randomBytes(16).toString('base64');
  return [
    'GET ' + path + ' HTTP/1.1',
    'Host: 127.0.0.1',
    'Upgrade: websocket',
    'Connection: ' + (options.connection || 'Upgrade'),
    'Sec-WebSocket-Key: ' + key,
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n');
}

function websocketRequest(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const chunks = [];
    socket.on('error', reject);
    socket.on('connect', () => {
      socket.write(upgradeRequest(path, options));
    });
    socket.on('data', chunk => {
      chunks.push(chunk);
      const response = Buffer.concat(chunks);
      const separator = response.indexOf('\r\n\r\n');
      if (separator === -1) return;

      const headers = response.subarray(0, separator).toString('utf8');
      const frame = response.subarray(separator + 4);
      if (options.sendAfterUpgrade && frame.length === 0) {
        socket.write(options.sendAfterUpgrade);
        options.sendAfterUpgrade = undefined;
        return;
      }
      if (frame.length < 2) return;

      const length = frame[1] & 0x7f;
      if (frame.length >= 2 + length) {
        socket.destroy();
        resolve({
          status: headers.split('\r\n')[0],
          message: readTextFrame(frame),
        });
      }
    });
  });
}

function rawUpgradeBody(port, path) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const chunks = [];
    socket.on('error', reject);
    socket.on('connect', () => socket.write(upgradeRequest(path)));
    socket.on('data', chunk => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
`;

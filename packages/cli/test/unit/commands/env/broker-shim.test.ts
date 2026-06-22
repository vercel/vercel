import { execFile } from 'node:child_process';
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildSync } from 'esbuild';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  startBroker,
  type Broker,
} from '../../../../src/commands/env/broker-service';

const execFileAsync = promisify(execFile);

const shimPath = resolve(process.cwd(), 'dist/commands/env/broker-shim.cjs');

const servers: http.Server[] = [];
const brokers: Broker[] = [];

beforeAll(() => {
  mkdirSync(dirname(shimPath), { recursive: true });
  buildSync({
    entryPoints: [resolve(process.cwd(), 'src/commands/env/broker-shim.ts')],
    outfile: shimPath,
    bundle: false,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
  });
});

async function listen(server: http.Server): Promise<number> {
  servers.push(server);
  await new Promise<void>(resolveListen =>
    server.listen(0, '127.0.0.1', () => resolveListen())
  );
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('server failed to bind');
  }
  return address.port;
}

describe('env broker shim', () => {
  afterEach(async () => {
    await Promise.all(brokers.splice(0).map(broker => broker.close()));
    await Promise.all(
      servers
        .splice(0)
        .map(
          server =>
            new Promise<void>(resolveClose =>
              server.close(() => resolveClose())
            )
        )
    );
  });

  it('preserves Request stream bodies when patching fetch', async () => {
    const dummy = 'vbroker_turso_auth_token_0123456789abcdefabcd_xx';
    const real = 'real-turso-token-0123456789abcdef';

    const upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(
          chunks as unknown as readonly Uint8Array[]
        ).toString('utf-8');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            authorization: req.headers.authorization,
            body,
          })
        );
      });
    });
    const upstreamPort = await listen(upstream);

    const broker = await startBroker({
      sessionId: 'test-session',
      subs: {
        dummyToReal: new Map([[dummy, real]]),
        realToDummy: new Map([[real, dummy]]),
      },
    });
    brokers.push(broker);

    const script = `
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ token: '${dummy}' })));
          controller.close();
        }
      });
      const res = await fetch(new Request('http://127.0.0.1:${upstreamPort}/echo', {
        method: 'POST',
        headers: { authorization: 'Bearer ${dummy}', 'content-type': 'application/json' },
        body,
        duplex: 'half'
      }));
      console.log(await res.text());
    `;

    const { stdout } = await execFileAsync(process.execPath, ['-e', script], {
      env: {
        ...process.env,
        NODE_OPTIONS: `--require ${JSON.stringify(shimPath)}`,
        VC_ENV_BROKER_URL: broker.url,
        VC_ENV_BROKER_LOCAL_TOKEN: 'test-session',
      },
    });

    const response = JSON.parse(stdout);
    expect(response).toEqual({
      authorization: `Bearer ${dummy}`,
      body: JSON.stringify({ token: dummy }),
    });
  });
});

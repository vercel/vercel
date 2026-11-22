import http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isValidDevResourceHost,
  getDevSchedulesEnv,
  listenOnDevResourcePort,
} from '../../../../src/util/dev/resource-servers';

const servers: http.Server[] = [];

describe('getDevSchedulesEnv', () => {
  it('does not mark the environment before the local resource starts', () => {
    expect(getDevSchedulesEnv(undefined)).toEqual({});
  });

  it.each([
    'localhost',
    '127.0.0.1',
    '[::1]',
  ])('preserves the proxy prefix when translating %s for containers', host => {
    expect(
      getDevSchedulesEnv(`http://${host}:3000/_svc/_schedules/session/`, true)
    ).toEqual({
      VERCEL_SCHEDULE_BASE_URL:
        'http://host.docker.internal:3000/_svc/_schedules/session',
      VERCEL_SCHEDULE_TOKEN: 'vc-dev-token',
      VERCEL_SCHEDULE_DEV_API_VERSION: '1',
    });
  });

  it('preserves an explicitly bound non-loopback proxy host', () => {
    expect(
      getDevSchedulesEnv('http://192.0.2.1:3000/_svc/_schedules/session', true)
        .VERCEL_SCHEDULE_BASE_URL
    ).toBe('http://192.0.2.1:3000/_svc/_schedules/session');
  });
});

async function occupyEphemeralPort(): Promise<{
  server: http.Server;
  port: number;
}> {
  const server = http.createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP server address');
  }
  return { server, port: address.port };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>(resolve => {
          server.close(() => resolve());
        })
    )
  );
});

describe('listenOnDevResourcePort', () => {
  it('uses OS allocation when port 0 is explicitly requested', async () => {
    const server = http.createServer();
    servers.push(server);

    const result = await listenOnDevResourcePort(server, {
      name: 'Vercel Queues',
      flag: '--queue-port',
      defaultPort: 4782,
      port: 0,
    });

    expect(result.port).toBeGreaterThan(0);
    expect(result.origin).toBe(`http://127.0.0.1:${result.port}`);
    expect(result.defaultPort).toBeUndefined();
  });

  it('increments an occupied default port', async () => {
    const { port } = await occupyEphemeralPort();
    const server = http.createServer();
    servers.push(server);

    const result = await listenOnDevResourcePort(server, {
      name: 'Vercel Queues',
      flag: '--queue-port',
      defaultPort: port,
    });

    expect(result.port).toBeGreaterThan(port);
    expect(result.defaultPort).toBe(port);
  });

  it('skips reserved ports while choosing a fallback', async () => {
    const server = http.createServer();
    servers.push(server);

    const result = await listenOnDevResourcePort(server, {
      name: 'Runtime Cache',
      flag: '--runtime-cache-port',
      defaultPort: 4783,
      reservedPorts: [4783, 4784],
    });

    expect(result.port).toBeGreaterThan(4784);
    expect(result.defaultPort).toBe(4783);
  });

  it('fails when an explicitly pinned port is occupied', async () => {
    const { port } = await occupyEphemeralPort();
    const server = http.createServer();

    await expect(
      listenOnDevResourcePort(server, {
        name: 'Runtime Cache',
        flag: '--runtime-cache-port',
        defaultPort: 4783,
        port,
      })
    ).rejects.toThrow(
      `Runtime Cache could not listen on 127.0.0.1:${port} because the port is already in use. Choose another port with --runtime-cache-port.`
    );
  });
});

describe('isValidDevResourceHost', () => {
  it('accepts exact loopback hosts for the listener port', () => {
    expect(
      isValidDevResourceHost('http://127.0.0.1:4782', '127.0.0.1:4782')
    ).toBe(true);
    expect(
      isValidDevResourceHost('http://127.0.0.1:4782', 'LOCALHOST:4782')
    ).toBe(true);
  });

  it('rejects non-exact hosts and ports', () => {
    expect(
      isValidDevResourceHost('http://127.0.0.1:4782', 'attacker.example')
    ).toBe(false);
    expect(
      isValidDevResourceHost('http://127.0.0.1:4782', 'localhost:4783')
    ).toBe(false);
    expect(
      isValidDevResourceHost('http://127.0.0.1:4782', 'localhost:4782/path')
    ).toBe(false);
  });

  it('handles URL-normalized port 80', () => {
    expect(isValidDevResourceHost('http://127.0.0.1:80', '127.0.0.1')).toBe(
      true
    );
    expect(isValidDevResourceHost('http://127.0.0.1:80', 'localhost')).toBe(
      true
    );
  });
});

import { ChildProcess } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import type http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnCommand } from '@vercel/build-utils';
import getPort from 'get-port';
import output from '../../../../src/output-manager';
import DevServer from '../../../../src/util/dev/server';
import { waitForPortToFree } from '../../../../src/util/dev/port-utils';
import {
  DEV_QUEUE_DEFAULT_PORT,
  DEV_RUNTIME_CACHE_DEFAULT_PORT,
  DEV_SCHEDULES_DEFAULT_PORT,
  type DevResourceEndpoints,
} from '../../../../src/util/dev/resource-servers';

vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  spawnCommand: vi.fn(),
}));

vi.mock('get-port', () => ({ default: vi.fn(async () => 4321) }));

vi.mock('../../../../src/util/dev/port-utils', () => ({
  checkForPort: vi.fn(async () => '127.0.0.1'),
  waitForPortToFree: vi.fn(async () => true),
}));

vi.mock('../../../../src/util/tree-kill', () => ({
  treeKill: vi.fn(async () => {}),
}));

interface Internals {
  server: http.Server;
  resourceEndpoints: DevResourceEndpoints;
}

type FakeChild = ChildProcess & { stdout: PassThrough; stderr: PassThrough };

function fakeChild(pid: number): FakeChild {
  return Object.assign(new ChildProcess(), {
    pid,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
}

function spawnedPorts(): string[] {
  return vi
    .mocked(spawnCommand)
    .mock.calls.map(([, options]) => String(options?.env?.PORT));
}

describe('DevServer without the router', () => {
  const children: FakeChild[] = [];

  beforeEach(() => {
    vi.mocked(spawnCommand).mockImplementation(() => {
      const child = fakeChild(1000 + children.length);
      children.push(child);
      return child;
    });
    vi.spyOn(output, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const child of children.splice(0)) {
      child.stdout.destroy();
      child.stderr.destroy();
      child.removeAllListeners();
    }
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('needs a port for the Development Command', () => {
    expect(() => new DevServer(process.cwd(), { routing: false })).toThrow(
      'devCommandPort'
    );
  });

  it('runs the Development Command on the pinned port', async () => {
    const server = new DevServer(process.cwd(), {
      projectSettings: { devCommand: 'next dev --port $PORT' },
      routing: false,
      devCommandPort: 3123,
    });

    await server.runDevCommand();

    expect(spawnedPorts()).toEqual(['3123']);
    expect(vi.mocked(spawnCommand).mock.calls[0][0]).toBe(
      'next dev --port 3123'
    );
    expect(getPort).not.toHaveBeenCalled();
    expect(server.devCommandOrigin).toBe('http://127.0.0.1:3123');
  });

  it('refuses a pinned port something else already listens on', async () => {
    vi.mocked(waitForPortToFree).mockResolvedValueOnce(false);
    const server = new DevServer(process.cwd(), {
      projectSettings: { devCommand: 'next dev --port $PORT' },
      routing: false,
      devCommandPort: 3123,
    });

    await expect(server.runDevCommand()).rejects.toMatchObject({
      name: 'DEV_COMMAND_PORT_IN_USE',
    });
    expect(spawnCommand).not.toHaveBeenCalled();
  });

  it('restarts on the pinned port only after the old command exits', async () => {
    const server = new DevServer(process.cwd(), {
      projectSettings: { devCommand: 'next dev --port $PORT' },
      routing: false,
      devCommandPort: 3123,
    });
    await server.runDevCommand();

    const restart = server.runDevCommand(true);
    await new Promise(resolve => setImmediate(resolve));
    expect(spawnCommand).toHaveBeenCalledTimes(1);

    children[0].emit('exit', 0, null);
    await restart;

    expect(spawnedPorts()).toEqual(['3123', '3123']);
  });

  it("gives a restarted command's app time to free the pinned port", async () => {
    const server = new DevServer(process.cwd(), {
      projectSettings: { devCommand: 'next dev --port $PORT' },
      routing: false,
      devCommandPort: 3123,
    });
    await server.runDevCommand();
    const restart = server.runDevCommand(true);
    await new Promise(resolve => setImmediate(resolve));
    children[0].emit('exit', 0, null);
    await restart;

    // A first start refuses a taken port at once; a restart waits for it.
    const [first, second] = vi.mocked(waitForPortToFree).mock.calls;
    expect(first).toEqual([3123, 0]);
    expect(second[0]).toBe(3123);
    expect(second[1]).toBeGreaterThan(0);
  });

  it('opens no listener and points resource clients at the direct URLs', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-dev-without-routing-'));
    const server = new DevServer(cwd, {
      routing: false,
      devCommandPort: 3123,
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    vi.spyOn(server, 'getVercelConfig').mockResolvedValue({});
    vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
    vi.spyOn(server, 'runDevCommand').mockResolvedValue(undefined);
    try {
      await server.start(3000, '127.0.0.1');

      expect(host.server.listening).toBe(false);
      expect(server.address.origin).toBe('http://localhost:3123');
      const { queues, runtimeCache, schedules } = host.resourceEndpoints;
      expect(queues.proxy).toBe(queues.direct);
      expect(runtimeCache.proxy).toBe(runtimeCache.direct);
      expect(schedules?.proxy).toBe(schedules?.direct);
    } finally {
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it.each([
    ['runtimeCache', DEV_RUNTIME_CACHE_DEFAULT_PORT],
    ['queues', DEV_QUEUE_DEFAULT_PORT],
    ['schedules', DEV_SCHEDULES_DEFAULT_PORT],
  ] as const)('keeps %s off a pinned port at its default (%i)', async (resource, port) => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-dev-without-routing-'));
    const server = new DevServer(cwd, {
      routing: false,
      devCommandPort: port,
      queuePort: resource === 'queues' ? undefined : 0,
      runtimeCachePort: resource === 'runtimeCache' ? undefined : 0,
      schedulesPort: resource === 'schedules' ? undefined : 0,
    });
    const host = server as unknown as Internals;
    vi.spyOn(server, 'getVercelConfig').mockResolvedValue({});
    vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
    vi.spyOn(server, 'runDevCommand').mockResolvedValue(undefined);
    vi.spyOn(output, 'warn').mockImplementation(() => {});
    vi.spyOn(output, 'print').mockImplementation(() => {});
    try {
      await server.start(3000, '127.0.0.1');

      const endpoint = host.resourceEndpoints[resource];
      expect(endpoint).toBeDefined();
      expect(new URL(endpoint!.direct).port).not.toBe(String(port));
    } finally {
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

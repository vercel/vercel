import { afterEach, describe, expect, test, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';

vi.mock('child_process', () => ({
  fork: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@vercel/build-utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@vercel/build-utils')>();
  return {
    ...actual,
    getOrCreateBunBinary: vi.fn(async () => '/mock/bun'),
  };
});

import { fork, spawn } from 'child_process';
import { forkDevServer, readMessage } from '../../src/fork-dev-server';

class FakeChild extends EventEmitter {
  pid = 1234;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

const originalNodeOptions = process.env.NODE_OPTIONS;

afterEach(() => {
  vi.clearAllMocks();
  if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS;
  else process.env.NODE_OPTIONS = originalNodeOptions;
});

function options(overrides: Partial<Parameters<typeof forkDevServer>[0]> = {}) {
  return {
    tsConfig: {},
    config: { debug: true },
    maybeTranspile: true,
    workPath: '/project',
    isTypeScript: false,
    isEsm: false,
    require_: {
      resolve: vi.fn(() => '/project/node_modules/tsx/dist/loader.mjs'),
    },
    entrypoint: 'api/index.js',
    meta: {
      env: { RUNTIME_ENV: 'runtime' },
      buildEnv: { BUILD_ENV: 'build' },
    },
    publicDir: 'public',
    devServerPath: '/builder/dev-server.mjs',
    ...overrides,
  } as Parameters<typeof forkDevServer>[0];
}

describe('forkDevServer contract', () => {
  test('forks Node with transpilation and serialized development context', async () => {
    process.env.NODE_OPTIONS = '--trace-warnings';
    const child = new FakeChild();
    vi.mocked(fork).mockReturnValue(child as unknown as ChildProcess);

    expect(await forkDevServer(options())).toBe(child);

    expect(fork).toHaveBeenCalledOnce();
    const [path, args, forkOptions] = vi.mocked(fork).mock.calls[0];
    expect({
      path,
      args,
      cwd: forkOptions.cwd,
      execArgv: forkOptions.execArgv,
    }).toEqual({
      path: '/builder/dev-server.mjs',
      args: [],
      cwd: '/project',
      execArgv: [],
    });
    expect(forkOptions.env).toMatchObject({
      RUNTIME_ENV: 'runtime',
      VERCEL_DEV_ENTRYPOINT: 'api/index.js',
      VERCEL_DEV_CONFIG: JSON.stringify({ debug: true }),
      VERCEL_DEV_BUILD_ENV: JSON.stringify({ BUILD_ENV: 'build' }),
      VERCEL_DEV_PUBLIC_DIR: 'public',
    });
    expect(forkOptions.env?.NODE_OPTIONS).toContain(
      `--import ${pathToFileURL('/project/node_modules/tsx/dist/loader.mjs')}`
    );
    expect(forkOptions.env?.NODE_OPTIONS).toContain('--trace-warnings');
    expect(forkOptions.env?.NODE_OPTIONS?.match(/--no-warnings/g)).toHaveLength(
      1
    );
  });

  test('does not inject the tsx loader for native ESM', async () => {
    process.env.NODE_OPTIONS = '--no-warnings';
    const child = new FakeChild();
    vi.mocked(fork).mockReturnValue(child as unknown as ChildProcess);

    await forkDevServer(options({ isEsm: true, maybeTranspile: true }));

    const forkOptions = vi.mocked(fork).mock.calls[0][2];
    expect(forkOptions.env?.NODE_OPTIONS).toBe('--no-warnings');
  });

  test('spawns Bun and emits readiness from split stdout chunks', async () => {
    const child = new FakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    await forkDevServer(options({ runtime: 'bun' }));
    const ready = readMessage(child as unknown as ChildProcess);
    child.stdout.emit('data', Buffer.from('Dev server '));
    child.stdout.emit('data', Buffer.from('listening: 12345'));

    await expect(ready).resolves.toEqual({
      state: 'message',
      value: { port: 12345 },
    });
    expect(spawn).toHaveBeenCalledWith(
      '/mock/bun',
      ['--bun', '/builder/dev-server.mjs'],
      expect.objectContaining({
        cwd: '/project',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );
  });

  test('rejects a child process without a PID', async () => {
    const child = new FakeChild();
    child.pid = 0;
    vi.mocked(fork).mockReturnValue(child as unknown as ChildProcess);

    await expect(forkDevServer(options())).rejects.toThrow(
      'Child Process has no "pid" when forking: "/builder/dev-server.mjs"'
    );
  });

  test('readMessage reports a close that wins the startup race', async () => {
    const child = new FakeChild();
    const result = readMessage(child as unknown as ChildProcess);

    child.emit('close', 17, 'SIGTERM');

    await expect(result).resolves.toEqual({
      state: 'exit',
      value: [17, 'SIGTERM'],
    });
  });
});

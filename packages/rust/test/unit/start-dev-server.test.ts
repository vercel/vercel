import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import getPort from 'get-port';
import { startDevServer } from '../../src/lib/start-dev-server';
import { installRustToolchain } from '../../src/lib/rust-toolchain';
import { buildExecutableForDev } from '../../src/lib/dev-build';

vi.mock('@vercel/build-utils', () => ({ debug: vi.fn() }));
vi.mock('../../src/lib/rust-toolchain', () => ({
  installRustToolchain: vi.fn(),
}));
vi.mock('../../src/lib/dev-build', () => ({
  buildExecutableForDev: vi.fn(),
}));
vi.mock('get-port', () => ({ default: vi.fn() }));
vi.mock('child_process', () => ({ spawn: vi.fn() }));

const EXECUTABLE = '/fake/target/debug/main';

// Flush pending microtasks (the awaits before `spawn`) so that the child
// process listeners are attached before the test emits events.
const flush = () => new Promise(resolve => setImmediate(resolve));

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid?: number;
  exitCode: number | null;
  signalCode: string | null;
  kill: ReturnType<typeof vi.fn>;
}

function makeChild(pid = 4242): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  return child;
}

function spawnEnv(): Record<string, string> {
  // spawn(executablePath, [], options)
  const call = vi.mocked(spawn).mock.calls[0];
  return (call[2] as any).env as Record<string, string>;
}

function start(meta: Record<string, unknown> = { isDev: true }) {
  return startDevServer({
    entrypoint: 'api/main.rs',
    workPath: '/work',
    config: {},
    meta,
    // Provide sinks so the dev server output doesn't leak to the test console
    onStdout: vi.fn(),
    onStderr: vi.fn(),
  } as any);
}

describe('startDevServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(installRustToolchain).mockResolvedValue(undefined as any);
    vi.mocked(buildExecutableForDev).mockResolvedValue(EXECUTABLE);
    vi.mocked(getPort).mockResolvedValue(54321 as any);
  });

  it('allocates a free port and passes it via VERCEL_DEV_PORT', async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as any);

    const promise = start();
    await flush();

    expect(getPort).toHaveBeenCalledTimes(1);
    const env = spawnEnv();
    expect(env.VERCEL_DEV_PORT).toBe('54321');
    expect(env.VERCEL_DEV).toBe('1');

    child.stdout.emit('data', Buffer.from('Dev server listening: 54321\n'));
    const result = await promise;

    expect(result).toMatchObject({ port: 54321, pid: 4242 });
    expect(typeof (result as any).shutdown).toBe('function');
  });

  it('returns the port reported by the runtime, not the requested one', async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as any);

    // Requested (allocated) port is 54321, but the runtime reports a different
    // port (e.g. an older runtime ignoring VERCEL_DEV_PORT). We must proxy to
    // the port the runtime actually bound.
    const promise = start();
    await flush();
    expect(spawnEnv().VERCEL_DEV_PORT).toBe('54321');

    child.stdout.emit('data', Buffer.from('Dev server listening: 9999\n'));
    const result = await promise;

    expect(result).toMatchObject({ port: 9999, pid: 4242 });
  });

  it('waits for the full readiness line before emitting the port', async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as any);

    const promise = start();
    await flush();

    // Partial line without the number must not resolve readiness yet.
    child.stdout.emit('data', Buffer.from('Dev server listening: '));
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    child.stdout.emit('data', Buffer.from('7777\n'));
    const result = await promise;
    expect(result).toMatchObject({ port: 7777 });
  });

  it('honors an explicitly requested meta.port without allocating a port', async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as any);

    const promise = start({ isDev: true, port: 40000 });
    await flush();

    expect(getPort).not.toHaveBeenCalled();
    expect(spawnEnv().VERCEL_DEV_PORT).toBe('40000');

    child.stdout.emit('data', Buffer.from('Dev server listening: 40000\n'));
    const result = await promise;
    expect(result).toMatchObject({ port: 40000, pid: 4242 });
  });

  it('forwards stdout and stderr to the provided callbacks', async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as any);

    const onStdout = vi.fn();
    const onStderr = vi.fn();
    const promise = startDevServer({
      entrypoint: 'api/main.rs',
      workPath: '/work',
      config: {},
      meta: { isDev: true },
      onStdout,
      onStderr,
    } as any);
    await flush();

    child.stderr.emit('data', Buffer.from('a log line\n'));
    child.stdout.emit('data', Buffer.from('Dev server listening: 54321\n'));
    await promise;

    expect(onStderr).toHaveBeenCalled();
    expect(onStdout).toHaveBeenCalled();
  });

  it('shutdown sends SIGTERM and resolves only after the process exits', async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as any);

    const promise = start();
    await flush();
    child.stdout.emit('data', Buffer.from('Dev server listening: 54321\n'));
    const result = (await promise) as { shutdown: () => Promise<void> };

    const shutdownPromise = result.shutdown();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    let resolved = false;
    void shutdownPromise.then(() => {
      resolved = true;
    });
    await flush();
    // Still running: shutdown must wait for the process to actually exit so the
    // port is released before vercel dev proceeds.
    expect(resolved).toBe(false);

    child.emit('exit', 0, null);
    await shutdownPromise;
    expect(resolved).toBe(true);
  });

  it('throws an actionable error when the port is already in use', async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as any);

    const promise = start();
    await flush();

    child.stderr.emit(
      'data',
      Buffer.from(
        'Error: Os { code: 48, kind: AddrInUse, message: "Address already in use" }\n'
      )
    );
    child.emit('close', 1, null);

    await expect(promise).rejects.toThrow(/address already in use/i);
  });

  it('returns null on an unknown early exit so vercel dev can fall back', async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child as any);

    const promise = start();
    await flush();

    child.emit('close', 1, null);

    await expect(promise).resolves.toBeNull();
  });

  it('installs global cleanup handlers that kill tracked dev servers', async () => {
    // Use a fresh module instance so the install-once guard runs in this test
    // and we can capture the handlers it registers on `process`.
    vi.resetModules();
    const cp = await import('child_process');
    const gp = await import('get-port');
    const toolchain = await import('../../src/lib/rust-toolchain');
    const build = await import('../../src/lib/dev-build');
    vi.mocked(toolchain.installRustToolchain).mockResolvedValue(
      undefined as any
    );
    vi.mocked(build.buildExecutableForDev).mockResolvedValue(EXECUTABLE);
    vi.mocked(gp.default).mockResolvedValue(54321 as any);

    const child = makeChild();
    vi.mocked(cp.spawn).mockReturnValue(child as any);

    const onSpy = vi.spyOn(process, 'on');
    const { startDevServer: freshStartDevServer } = await import(
      '../../src/lib/start-dev-server'
    );

    const promise = freshStartDevServer({
      entrypoint: 'api/main.rs',
      workPath: '/work',
      config: {},
      meta: { isDev: true },
      onStdout: vi.fn(),
      onStderr: vi.fn(),
    } as any);
    await flush();
    child.stdout.emit('data', Buffer.from('Dev server listening: 54321\n'));
    await promise;

    // Handlers for graceful signals + the synchronous exit backstop.
    for (const event of ['SIGINT', 'SIGTERM', 'SIGHUP', 'exit']) {
      expect(onSpy.mock.calls.some(call => call[0] === event)).toBe(true);
    }

    // A graceful signal sends SIGTERM to the tracked child.
    const sigtermHandler = onSpy.mock.calls.find(
      call => call[0] === 'SIGTERM'
    )?.[1] as () => void;
    sigtermHandler();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    // The synchronous exit backstop force-kills any still-running child.
    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation(() => true as any);
    const exitHandler = onSpy.mock.calls.find(
      call => call[0] === 'exit'
    )?.[1] as () => void;
    exitHandler();
    expect(killSpy).toHaveBeenCalledWith(4242, 'SIGKILL');

    killSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('untracks a dev server once it exits so cleanup does not target it', async () => {
    vi.resetModules();
    const cp = await import('child_process');
    const gp = await import('get-port');
    const toolchain = await import('../../src/lib/rust-toolchain');
    const build = await import('../../src/lib/dev-build');
    vi.mocked(toolchain.installRustToolchain).mockResolvedValue(
      undefined as any
    );
    vi.mocked(build.buildExecutableForDev).mockResolvedValue(EXECUTABLE);
    vi.mocked(gp.default).mockResolvedValue(54321 as any);

    const child = makeChild();
    vi.mocked(cp.spawn).mockReturnValue(child as any);

    const onSpy = vi.spyOn(process, 'on');
    const { startDevServer: freshStartDevServer } = await import(
      '../../src/lib/start-dev-server'
    );

    const promise = freshStartDevServer({
      entrypoint: 'api/main.rs',
      workPath: '/work',
      config: {},
      meta: { isDev: true },
      onStdout: vi.fn(),
      onStderr: vi.fn(),
    } as any);
    await flush();
    child.stdout.emit('data', Buffer.from('Dev server listening: 54321\n'));
    await promise;

    // The child exits on its own; it must be removed from the registry.
    child.emit('exit', 0, null);

    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation(() => true as any);
    const exitHandler = onSpy.mock.calls.find(
      call => call[0] === 'exit'
    )?.[1] as () => void;
    exitHandler();
    expect(killSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
    onSpy.mockRestore();
  });
});

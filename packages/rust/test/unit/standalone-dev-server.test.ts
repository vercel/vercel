import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StartDevServerOptions } from '@vercel/build-utils';

vi.mock('@vercel/build-utils', () => ({
  debug: vi.fn(),
  cloneEnv: (...envs: (NodeJS.ProcessEnv | undefined)[]) =>
    Object.assign({}, ...envs),
  getLambdaOptionsFromFunction: vi.fn(async () => undefined),
  getReportedServiceType: vi.fn(),
}));

vi.mock('@vercel-internals/ipc-proxy', () => ({
  createStandaloneLambda: vi.fn(),
  getStandaloneServerRoutes: vi.fn(),
  startDevProxy: vi.fn(),
}));

vi.mock('../../src/lib/rust-toolchain', () => ({
  installRustToolchain: vi.fn(async () => {}),
}));

vi.mock('../../src/lib/cargo', () => ({
  getCargoMetadata: vi.fn(async () => ({ target_directory: '/fake/target' })),
  findCargoWorkspace: vi.fn(async () => ({})),
  findCargoBuildConfiguration: vi.fn(async () => undefined),
  resolveStandaloneBinary: vi.fn(() => ({
    name: 'server',
    packageName: 'app',
    srcPath: '/fake/src/main.rs',
  })),
  assertStandaloneBinary: vi.fn(),
}));

vi.mock('../../src/lib/compile', () => ({
  compileCargoBinary: vi.fn(async () => {}),
  createRustEnv: vi.fn(() => ({ PATH: '', RUSTFLAGS: '' })),
  getRustHostTargetTriple: vi.fn(async () => 'x86_64-unknown-linux-gnu'),
  getTargetTriple: vi.fn(() => 'x86_64-unknown-linux-gnu'),
  resolveCompiledBinaryPath: vi.fn(() => '/fake/target/debug/server'),
}));

vi.mock('../../src/lib/utils', () => ({
  gatherExtraFiles: vi.fn(async () => ({})),
  runUserScripts: vi.fn(async () => {}),
}));

vi.mock('../../src/diagnostics', () => ({
  generateProjectManifest: vi.fn(async () => {}),
  diagnostics: vi.fn(),
}));

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

function makeChild(pid = 4242) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = pid;
  child.kill = vi.fn();
  return child;
}

const OPTS = {
  files: {},
  entrypoint: 'src/main.rs',
  workPath: '/fake/project',
  config: { framework: 'rust' },
  meta: { isDev: true },
} as unknown as StartDevServerOptions;

async function load() {
  vi.resetModules();
  const ipc = await import('@vercel-internals/ipc-proxy');
  const compile = await import('../../src/lib/compile');
  const { startStandaloneDevServer } = await import(
    '../../src/standalone-server'
  );
  return { ipc, compile, startStandaloneDevServer };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startStandaloneDevServer', () => {
  it('reports the server as persistent', async () => {
    const { ipc, startStandaloneDevServer } = await load();
    const child = makeChild();
    const close = vi.fn(async () => {});
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close,
    });

    const result = await startStandaloneDevServer(OPTS);

    // Without this the CLI registers a per-response teardown that tree-kills
    // the server as soon as two responses close concurrently.
    expect(result).toMatchObject({ port: 5000, pid: 4242, persistent: true });
  });

  it('reuses the server across requests and keeps reporting it persistent', async () => {
    const { ipc, compile, startStandaloneDevServer } = await load();
    const child = makeChild();
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close: vi.fn(async () => {}),
    });

    const first = await startStandaloneDevServer(OPTS);
    const second = await startStandaloneDevServer(OPTS);

    expect(second).toMatchObject({
      port: first!.port,
      pid: first!.pid,
      persistent: true,
    });
    expect(ipc.startDevProxy).toHaveBeenCalledTimes(1);
    expect(compile.compileCargoBinary).toHaveBeenCalledTimes(1);
  });

  it('rebuilds and restarts after a source file changes', async () => {
    const { ipc, compile, startStandaloneDevServer } = await load();
    const firstChild = makeChild(4242);
    const secondChild = makeChild(4343);
    const firstClose = vi.fn(async () => {});
    const secondClose = vi.fn(async () => {});
    vi.mocked(ipc.startDevProxy)
      .mockResolvedValueOnce({
        port: 5000,
        pid: firstChild.pid,
        child: firstChild,
        close: firstClose,
      })
      .mockResolvedValueOnce({
        port: 5001,
        pid: secondChild.pid,
        child: secondChild,
        close: secondClose,
      });

    const source = { type: 'FileFsRef' };
    const first = await startStandaloneDevServer({
      ...OPTS,
      files: { 'src/main.rs': source },
    } as StartDevServerOptions);
    const unchanged = await startStandaloneDevServer({
      ...OPTS,
      files: { 'src/main.rs': source },
    } as StartDevServerOptions);
    const changed = await startStandaloneDevServer({
      ...OPTS,
      files: { 'src/main.rs': { type: 'FileFsRef' } },
    } as StartDevServerOptions);

    expect(unchanged).toMatchObject({ port: first!.port, pid: first!.pid });
    expect(changed).toMatchObject({ port: 5001, pid: 4343 });
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(ipc.startDevProxy).toHaveBeenCalledTimes(2);
    expect(compile.compileCargoBinary).toHaveBeenCalledTimes(2);
  });

  it('starts the server once for concurrent first requests', async () => {
    const { ipc, startStandaloneDevServer } = await load();
    const child = makeChild();
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close: vi.fn(async () => {}),
    });

    const results = await Promise.all([
      startStandaloneDevServer(OPTS),
      startStandaloneDevServer(OPTS),
      startStandaloneDevServer(OPTS),
    ]);

    expect(ipc.startDevProxy).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toMatchObject({ port: 5000, persistent: true });
    }
  });

  it('tears the server down when `shutdown` is called, and restarts after', async () => {
    const { ipc, startStandaloneDevServer } = await load();
    const child = makeChild();
    const close = vi.fn(async () => {});
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close,
    });

    const result = await startStandaloneDevServer(OPTS);
    await result!.shutdown?.();
    expect(close).toHaveBeenCalledTimes(1);

    // The cached handle is dropped, so the next request starts a fresh server.
    await startStandaloneDevServer(OPTS);
    expect(ipc.startDevProxy).toHaveBeenCalledTimes(2);
  });
});

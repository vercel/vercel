import { EventEmitter } from 'node:events';
import { dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StartDevServerOptions } from '@vercel/build-utils';

vi.mock('@vercel/build-utils', () => ({
  debug: vi.fn(),
  cloneEnv: (...envs: (NodeJS.ProcessEnv | undefined)[]) =>
    Object.assign({}, ...envs),
  glob: vi.fn(),
  download: vi.fn(),
  getWriteableDirectory: vi.fn(async () => '/fake/out'),
  getLambdaOptionsFromFunction: vi.fn(async () => undefined),
  execCommand: vi.fn(),
  getReportedServiceType: vi.fn(),
}));

vi.mock('@vercel-internals/ipc-proxy', () => ({
  createStandaloneLambda: vi.fn(),
  startDevProxy: vi.fn(),
}));

vi.mock('../src/go-helpers', () => ({
  createGo: vi.fn(async () => ({
    build: vi.fn(async () => {}),
    getEnv: () => ({ PATH: '/fake/go/bin', GOCACHE: '/fake/gocache' }),
    resolvedVersion: 'go1.25.0',
    versionSource: { kind: 'default' },
  })),
  findGoBinary: vi.fn(),
  findGoModPath: vi.fn(async () => undefined),
  findGoWorkPath: vi.fn(async () => undefined),
}));

vi.mock('../src/diagnostics', () => ({
  generateProjectManifest: vi.fn(async () => {}),
}));

// No `go.mod` and no `vendor/modules.txt` on the fake filesystem.
vi.mock('fs-extra', () => ({
  mkdirp: vi.fn(async () => {}),
  pathExists: vi.fn(async () => false),
  remove: vi.fn(async () => {}),
}));

vi.mock('child_process', () => ({ spawn: vi.fn() }));

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
  kill: ReturnType<typeof vi.fn>;
};

const children: FakeChild[] = [];

function makeChild(pid = 4242): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = pid;
  child.kill = vi.fn();
  children.push(child);
  return child;
}

const ENTRYPOINT = 'main.go';

const OPTS = {
  files: {},
  entrypoint: ENTRYPOINT,
  workPath: '/fake/project',
  config: { framework: 'go' },
  meta: { isDev: true, devCacheDir: '/fake/cache' },
} as unknown as StartDevServerOptions;

async function load() {
  vi.resetModules();
  const ipc = await import('@vercel-internals/ipc-proxy');
  const fsExtra = await import('fs-extra');
  const goHelpers = await import('../src/go-helpers');
  const childProcess = await import('child_process');
  const { startStandaloneDevServer } = await import('../src/standalone-server');
  return {
    ipc,
    fsExtra,
    goHelpers,
    childProcess,
    startStandaloneDevServer,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  children.length = 0;
  vi.spyOn(process, 'kill').mockImplementation(() => true);
});

afterEach(async () => {
  for (const child of children) {
    child.emit('exit', 0, null);
  }
  await Promise.resolve();
  vi.restoreAllMocks();
});

describe('startStandaloneDevServer', () => {
  it('fronts the compiled server with the shared dev proxy', async () => {
    const { ipc, startStandaloneDevServer } = await load();
    const child = makeChild();
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close: vi.fn(async () => {}),
    });

    const result = await startStandaloneDevServer(OPTS, ENTRYPOINT);

    expect(ipc.startDevProxy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ port: 5000, pid: 4242, persistent: true });
  });

  it('builds the entrypoint and spawns the binary directly, not `go run`', async () => {
    const { ipc, goHelpers, childProcess, startStandaloneDevServer } =
      await load();
    const child = makeChild();
    const kill = vi.mocked(process.kill);
    const build = vi.fn(async () => {});
    vi.mocked(goHelpers.createGo).mockResolvedValue({
      build,
      getEnv: () => ({ PATH: '/fake/go/bin' }),
    } as unknown as Awaited<ReturnType<typeof goHelpers.createGo>>);
    vi.mocked(childProcess.spawn).mockReturnValue(
      child as unknown as ReturnType<typeof childProcess.spawn>
    );
    vi.mocked(ipc.startDevProxy).mockImplementation(async options => {
      const spawned = options.spawnServer(51234);
      return {
        port: 5000,
        pid: spawned.pid!,
        child: spawned,
        close: vi.fn(async () => {}),
      };
    });

    const result = await startStandaloneDevServer(OPTS, ENTRYPOINT);

    const [buildTarget, dest, buildOptions] = build.mock
      .calls[0] as unknown as [string, string, { release: boolean }];
    expect(buildTarget).toBe('.');
    expect(dest).toContain('go-standalone');
    expect(buildOptions).toMatchObject({ release: false });

    const [command, args, spawnOptions] = vi.mocked(childProcess.spawn).mock
      .calls[0] as unknown as [
      string,
      string[],
      { detached: boolean; env: NodeJS.ProcessEnv },
    ];
    expect(command).toBe(dest);
    expect(command).not.toContain('go run');
    expect(args).toEqual([]);
    expect(spawnOptions.env.PORT).toBe('51234');
    expect(spawnOptions.detached).toBe(process.platform !== 'win32');

    await result.shutdown?.();
    if (process.platform === 'win32') {
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      expect(kill).not.toHaveBeenCalled();
    } else {
      expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM');
    }
  });

  it('resolves a nested entrypoint to its package directory', async () => {
    const { ipc, goHelpers, startStandaloneDevServer } = await load();
    const child = makeChild();
    const build = vi.fn(async () => {});
    vi.mocked(goHelpers.createGo).mockResolvedValue({
      build,
      getEnv: () => ({}),
    } as unknown as Awaited<ReturnType<typeof goHelpers.createGo>>);
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close: vi.fn(async () => {}),
    });

    await startStandaloneDevServer(OPTS, 'cmd/api/main.go');

    expect(build.mock.calls[0][0]).toBe('./cmd/api');
  });

  it.each([
    'off',
    'auto',
    '/fake/ci.work',
  ])('passes the effective GOWORK=%s to discovery while keeping the service workPath', async goWork => {
    const { ipc, goHelpers, startStandaloneDevServer } = await load();
    const child = makeChild();
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close: vi.fn(async () => {}),
    });
    vi.mocked(goHelpers.findGoModPath).mockResolvedValueOnce('/fake/go.mod');
    const workspaceFile = goWork === 'off' ? undefined : '/fake/ci.work';
    vi.mocked(goHelpers.findGoWorkPath).mockResolvedValueOnce(workspaceFile);

    await startStandaloneDevServer(
      {
        ...OPTS,
        repoRootPath: '/fake',
        meta: { ...OPTS.meta, env: { GOWORK: goWork } },
      },
      ENTRYPOINT
    );

    expect(goHelpers.findGoWorkPath).toHaveBeenCalledWith(
      OPTS.workPath,
      '/fake',
      goWork
    );
    expect(goHelpers.createGo).toHaveBeenCalledWith({
      modulePath: '/fake',
      workspaceFile,
      workPath: OPTS.workPath,
      opts: expect.objectContaining({ cwd: OPTS.workPath }),
      preferNewestToolchain: true,
    });
  });

  it('removes the build directory when compilation fails', async () => {
    const { fsExtra, goHelpers, ipc, startStandaloneDevServer } = await load();
    const build = vi.fn(async () => {
      throw new Error('build failed');
    });
    vi.mocked(goHelpers.createGo).mockResolvedValue({
      build,
      getEnv: () => ({}),
    } as unknown as Awaited<ReturnType<typeof goHelpers.createGo>>);

    await expect(startStandaloneDevServer(OPTS, ENTRYPOINT)).rejects.toThrow(
      'build failed'
    );

    const executablePath = build.mock.calls[0][1] as string;
    expect(fsExtra.remove).toHaveBeenCalledWith(dirname(executablePath));
    expect(ipc.startDevProxy).not.toHaveBeenCalled();
  });

  it('removes the build directory when proxy startup fails', async () => {
    const { fsExtra, goHelpers, ipc, startStandaloneDevServer } = await load();
    const build = vi.fn(async () => {});
    vi.mocked(goHelpers.createGo).mockResolvedValue({
      build,
      getEnv: () => ({}),
    } as unknown as Awaited<ReturnType<typeof goHelpers.createGo>>);
    vi.mocked(ipc.startDevProxy).mockRejectedValue(new Error('startup failed'));

    await expect(startStandaloneDevServer(OPTS, ENTRYPOINT)).rejects.toThrow(
      'startup failed'
    );

    const executablePath = build.mock.calls[0][1] as string;
    expect(fsExtra.remove).toHaveBeenCalledWith(dirname(executablePath));
  });

  it('reuses the server across requests without rebuilding', async () => {
    const { ipc, goHelpers, startStandaloneDevServer } = await load();
    const child = makeChild();
    const build = vi.fn(async () => {});
    vi.mocked(goHelpers.createGo).mockResolvedValue({
      build,
      getEnv: () => ({}),
    } as unknown as Awaited<ReturnType<typeof goHelpers.createGo>>);
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close: vi.fn(async () => {}),
    });

    const first = await startStandaloneDevServer(OPTS, ENTRYPOINT);
    const second = await startStandaloneDevServer(OPTS, ENTRYPOINT);

    expect(second).toMatchObject({
      port: first!.port,
      pid: first!.pid,
      persistent: true,
    });
    expect(ipc.startDevProxy).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('honors an orchestrator-assigned port', async () => {
    const { ipc, startStandaloneDevServer } = await load();
    const child = makeChild();
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 6100,
      pid: child.pid,
      child,
      close: vi.fn(async () => {}),
    });

    await startStandaloneDevServer(
      {
        ...OPTS,
        meta: { ...OPTS.meta, port: 6100 },
      } as unknown as StartDevServerOptions,
      ENTRYPOINT
    );

    expect(vi.mocked(ipc.startDevProxy).mock.calls[0][0]).toMatchObject({
      port: 6100,
    });
  });

  it('starts one server when concurrent requests race', async () => {
    const { ipc, goHelpers, startStandaloneDevServer } = await load();
    const child = makeChild();
    const build = vi.fn(async () => {});
    vi.mocked(goHelpers.createGo).mockResolvedValue({
      build,
      getEnv: () => ({}),
    } as unknown as Awaited<ReturnType<typeof goHelpers.createGo>>);
    vi.mocked(ipc.startDevProxy).mockResolvedValue({
      port: 5000,
      pid: child.pid,
      child,
      close: vi.fn(async () => {}),
    });

    const [a, b] = await Promise.all([
      startStandaloneDevServer(OPTS, ENTRYPOINT),
      startStandaloneDevServer(OPTS, ENTRYPOINT),
    ]);

    expect(a).toMatchObject({ port: 5000, persistent: true });
    expect(b).toMatchObject({ port: 5000, persistent: true });
    expect(ipc.startDevProxy).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('drops the cached server and tears down the proxy when it exits', async () => {
    const { ipc, startStandaloneDevServer } = await load();
    const firstChild = makeChild(4242);
    const secondChild = makeChild(4343);
    const firstClose = vi.fn(async () => {});
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
        close: vi.fn(async () => {}),
      });

    await startStandaloneDevServer(OPTS, ENTRYPOINT);
    firstChild.emit('exit', 1, null);
    await Promise.resolve();

    const next = await startStandaloneDevServer(OPTS, ENTRYPOINT);

    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(next).toMatchObject({ port: 5001, pid: 4343 });
    expect(ipc.startDevProxy).toHaveBeenCalledTimes(2);
  });
});

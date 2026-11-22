import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { startContainerCleanup } from '../src/buildah-store-cache/cleanup';
import { STORE_COMMAND_SCRIPT } from '../src/buildah-store-cache/command';
import type { StoreCommandRequest } from '../src/buildah-store-cache/command/types';
import {
  __resetFlockAvailability,
  sharedBuildahStoreLock,
} from '../src/buildah-store-cache/lock';
import {
  buildahStoreStateDirectory,
  listStateRecords,
} from '../src/buildah-store-cache/state';
import { creatorArgs } from '../src/buildpacks/lifecycle/lifecycle';
import { BuildahClient } from '../src/clients/buildah';
import {
  createBuildahEngine,
  deploymentSourceDateEpoch,
} from '../src/engines/buildah';
import type { BuildPushParams } from '../src/engines/types';
import { buildSchedulesCommandImage } from '../src/schedules-command';
import {
  __resetStorageDriverCache,
  buildahStorageArgs,
} from '../src/storage-driver';

const { runMock, hasCommandMock, debugMock, spawnMock } = vi.hoisted(() => ({
  runMock: vi.fn<typeof import('../src/util').run>(),
  hasCommandMock: vi.fn<typeof import('../src/util').hasCommand>(),
  debugMock: vi.fn<(message: string) => void>(),
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', async importActual => ({
  ...(await importActual<typeof import('node:child_process')>()),
  spawn: spawnMock,
}));

vi.mock('../src/util', async importActual => {
  const actual = await importActual<typeof import('../src/util')>();
  return {
    ...actual,
    run: runMock,
    hasCommand: hasCommandMock,
    debug: debugMock,
    DEBUG: true,
    isBuildContainer: () => true,
  };
});

function debugMessages(): string[] {
  return debugMock.mock.calls.map(([message]) => message);
}

const sharedLockArgs = () => [
  '--shared',
  '--close',
  join(tmpdir(), 'vercel-buildah-store.lock'),
];

let temporaryDirectory: string;
let client: BuildahClient;

beforeAll(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'vercel-buildah-debug-'));
});

beforeEach(() => {
  vi.clearAllMocks();
  runMock.mockReset();
  spawnMock.mockReset();
  hasCommandMock.mockResolvedValue(true);
  __resetStorageDriverCache();
  __resetFlockAvailability();
  vi.stubEnv('TMPDIR', temporaryDirectory);
  vi.stubEnv('TMP', temporaryDirectory);
  vi.stubEnv('TEMP', temporaryDirectory);
  vi.stubEnv('VERCEL_DEPLOYMENT_ID', `buildah-debug-${randomUUID()}`);
  vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '0');
  vi.stubEnv('VERCEL_VCR_DOCKER_STORAGE_DRIVER', '');
  client = new BuildahClient(sharedBuildahStoreLock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetStorageDriverCache();
  __resetFlockAvailability();
});

afterAll(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe('BuildahClient', () => {
  it('does not probe commands or the store during construction', () => {
    expect(runMock).not.toHaveBeenCalled();
    expect(hasCommandMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('passes input, quiet, and environment options through to run', async () => {
    const options = {
      input: 'registry-token',
      quiet: true,
      env: { REGISTRY_AUTH_FILE: '/tmp/buildah-auth.json' },
    };
    const result = { stdout: 'Login Succeeded!\n', stderr: '' };
    const storageArgs = await buildahStorageArgs();
    runMock.mockResolvedValueOnce(result);

    await expect(
      client.run(['login', '--password-stdin', 'vcr.vercel.com'], options)
    ).resolves.toEqual(result);

    expect(runMock).toHaveBeenCalledExactlyOnceWith(
      'buildah',
      [...storageArgs, 'login', '--password-stdin', 'vcr.vercel.com'],
      options
    );
  });

  it('retries a failed version query and caches the successful retry', async () => {
    const failure = new Error('buildah is unavailable');
    runMock.mockRejectedValueOnce(failure).mockResolvedValueOnce({
      stdout: 'buildah version 1.40.0\n',
      stderr: '',
    });

    await expect(
      Promise.all([client.version(), client.version()])
    ).rejects.toBe(failure);
    expect(runMock).toHaveBeenCalledOnce();

    await expect(client.version()).resolves.toBe('buildah version 1.40.0');
    await expect(client.version()).resolves.toBe('buildah version 1.40.0');
    expect(runMock).toHaveBeenCalledTimes(2);
    for (const call of runMock.mock.calls) {
      expect(call).toEqual(['buildah', ['--version'], { quiet: true }]);
    }
  });

  it('runs each command in place of what its lock returns', async () => {
    const lock = {
      wrap: vi.fn(async (command: string[]) => ['locked', ...command]),
    };
    const storageArgs = await buildahStorageArgs();
    runMock.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await new BuildahClient(lock).run(['images'], { quiet: true });

    expect(lock.wrap).toHaveBeenCalledExactlyOnceWith([
      'buildah',
      ...storageArgs,
      'images',
    ]);
    expect(runMock).toHaveBeenCalledExactlyOnceWith(
      'locked',
      ['buildah', ...storageArgs, 'images'],
      { quiet: true }
    );
  });

  it('keeps version queries isolated between clients', async () => {
    const otherClient = new BuildahClient(sharedBuildahStoreLock);
    runMock
      .mockResolvedValueOnce({ stdout: 'buildah version 1.39.0\n', stderr: '' })
      .mockResolvedValueOnce({
        stdout: 'buildah version 1.40.0\n',
        stderr: '',
      });

    await expect(
      Promise.all([client.version(), otherClient.version()])
    ).resolves.toEqual(['buildah version 1.39.0', 'buildah version 1.40.0']);
    await expect(client.version()).resolves.toBe('buildah version 1.39.0');
    await expect(otherClient.version()).resolves.toBe('buildah version 1.40.0');
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});

describe('BuildahClient.info', () => {
  const store = {
    GraphRoot: '/vercel/.containers/storage',
    RunRoot: '/run/containers/storage',
    GraphDriverName: 'overlay',
    GraphStatus: {
      'Backing Filesystem': 'xfs',
      'Native Overlay Diff': 'true',
    },
    ContainerStore: { number: 3 },
  };
  const expectedInfo = {
    graphRoot: '/vercel/.containers/storage',
    runRoot: '/run/containers/storage',
    driver: 'overlay',
    backingFs: 'xfs',
  };

  it('shares concurrent and repeated queries through one shared-lock command and returns only the four stable fields', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');
    const storageArgs = await buildahStorageArgs();
    runMock.mockResolvedValueOnce({
      stdout: JSON.stringify({ host: { hostname: 'build-cell' }, store }),
      stderr: '',
    });

    await expect(Promise.all([client.info(), client.info()])).resolves.toEqual([
      expectedInfo,
      expectedInfo,
    ]);
    await expect(client.info()).resolves.toEqual(expectedInfo);

    expect(runMock).toHaveBeenCalledExactlyOnceWith(
      'flock',
      [...sharedLockArgs(), 'buildah', ...storageArgs, 'info'],
      { quiet: true }
    );
  });

  it('accepts the alternate backing filesystem field spelling', async () => {
    runMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        store: { ...store, GraphStatus: { 'Backing filesystem': 'ext4' } },
      }),
      stderr: '',
    });

    await expect(client.info()).resolves.toEqual({
      ...expectedInfo,
      backingFs: 'ext4',
    });
    expect(runMock).toHaveBeenCalledOnce();
  });

  it('uses empty strings for fields missing from an existing store', async () => {
    runMock.mockResolvedValueOnce({ stdout: '{"store":{}}', stderr: '' });

    await expect(client.info()).resolves.toEqual({
      graphRoot: '',
      runRoot: '',
      driver: '',
      backingFs: '',
    });
    await expect(client.info()).resolves.toEqual({
      graphRoot: '',
      runRoot: '',
      driver: '',
      backingFs: '',
    });
    expect(runMock).toHaveBeenCalledOnce();
  });

  it('retries when the info response has no store and caches the successful retry', async () => {
    runMock
      .mockResolvedValueOnce({ stdout: '{"host":{}}', stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ store }), stderr: '' });

    await expect(Promise.all([client.info(), client.info()])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(runMock).toHaveBeenCalledOnce();

    await expect(client.info()).resolves.toEqual(expectedInfo);
    await expect(client.info()).resolves.toEqual(expectedInfo);
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it('retries a rejected info command and caches the successful retry', async () => {
    const failure = new Error('store is unavailable');
    runMock.mockRejectedValueOnce(failure).mockResolvedValueOnce({
      stdout: JSON.stringify({ store }),
      stderr: '',
    });

    await expect(Promise.all([client.info(), client.info()])).rejects.toBe(
      failure
    );
    expect(runMock).toHaveBeenCalledOnce();

    await expect(client.info()).resolves.toEqual(expectedInfo);
    await expect(client.info()).resolves.toEqual(expectedInfo);
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it('retries after an invalid JSON response', async () => {
    runMock
      .mockResolvedValueOnce({ stdout: 'not JSON', stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ store }), stderr: '' });

    await expect(client.info()).rejects.toBeInstanceOf(SyntaxError);
    await expect(client.info()).resolves.toEqual(expectedInfo);
    await expect(client.info()).resolves.toEqual(expectedInfo);
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it('keeps store info isolated between clients', async () => {
    const otherClient = new BuildahClient(sharedBuildahStoreLock);
    const otherStore = {
      GraphRoot: '/tmp/other-buildah-store',
      RunRoot: '/tmp/other-buildah-runroot',
      GraphDriverName: 'vfs',
      GraphStatus: { 'Backing Filesystem': 'ext4' },
    };
    const otherInfo = {
      graphRoot: '/tmp/other-buildah-store',
      runRoot: '/tmp/other-buildah-runroot',
      driver: 'vfs',
      backingFs: 'ext4',
    };
    runMock
      .mockResolvedValueOnce({ stdout: JSON.stringify({ store }), stderr: '' })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ store: otherStore }),
        stderr: '',
      });

    await expect(
      Promise.all([client.info(), otherClient.info()])
    ).resolves.toEqual([expectedInfo, otherInfo]);
    await expect(client.info()).resolves.toEqual(expectedInfo);
    await expect(otherClient.info()).resolves.toEqual(otherInfo);
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it('shares cached info with storage verification', async () => {
    vi.stubEnv('VERCEL_VCR_STRICT_STORAGE', '1');
    const log = vi.fn<(message: string) => void>();
    runMock.mockResolvedValueOnce({
      stdout: JSON.stringify({ store }),
      stderr: '',
    });

    await expect(client.info()).resolves.toEqual(expectedInfo);
    await expect(client.verifyStorage(log)).resolves.toBeUndefined();
    await expect(client.verifyStorage(log)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith(
      'buildah storage: driver=overlay graphRoot=/vercel/.containers/storage ' +
        'runRoot=/run/containers/storage backingFs=xfs — verified'
    );
    expect(runMock).toHaveBeenCalledOnce();
  });
});

describe('Buildah engine metadata', () => {
  it('shares queries between readiness, diagnostics, verification and reporting', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');
    const engine = createBuildahEngine(client);
    runMock.mockImplementation(async (_command, args) => ({
      stdout: args.includes('--version')
        ? 'buildah version 1.39.0\n'
        : JSON.stringify({
            store: {
              GraphRoot: '/vercel/.containers/storage',
              RunRoot: '/run/containers/storage',
              GraphDriverName: 'overlay',
              GraphStatus: { 'Backing Filesystem': 'xfs' },
            },
          }),
      stderr: '',
    }));

    await engine.ensureReady();
    await engine.logDiagnostics();
    await engine.verifyStorage?.();
    await engine.reportStorage?.();

    expect(
      runMock.mock.calls.filter(([, args]) => args.includes('--version'))
    ).toHaveLength(1);
    expect(
      runMock.mock.calls.filter(([, args]) => args.includes('info'))
    ).toHaveLength(1);
    expect(hasCommandMock).toHaveBeenCalledExactlyOnceWith('flock');
  });
});

describe('buildah debug logging', () => {
  it('logs each invocation with the storage flags and how long it took', async () => {
    runMock.mockResolvedValueOnce({ stdout: '{}', stderr: '' });

    await client.run(['info'], { quiet: true });

    const [cmd, args, opts] = runMock.mock.calls[0];
    expect(cmd).toBe('buildah');
    expect(args.slice(0, 4)).toEqual([
      '--root',
      '/vercel/.containers/storage',
      '--runroot',
      '/run/containers/storage',
    ]);
    expect(args.at(-1)).toBe('info');
    expect(opts).toEqual({ quiet: true });
    expect(debugMessages()).toEqual([
      `exec: buildah ${args.join(' ')}`,
      expect.stringMatching(/^buildah info finished in \d+ms$/),
    ]);
  });

  it('logs how long a failed invocation ran before rethrowing', async () => {
    runMock.mockRejectedValueOnce(new Error('denied'));

    await expect(client.run(['login', 'vcr.vercel.com'])).rejects.toThrow(
      'denied'
    );
    expect(debugMessages().at(-1)).toMatch(
      /^buildah login failed after \d+ms$/
    );
  });
});

describe('Buildah store lock', () => {
  it('wraps every command in the shared lock while the store cache is enabled', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');
    const storageArgs = await buildahStorageArgs();
    runMock.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await client.run(['images', '--quiet'], { quiet: true });
    expect(runMock).toHaveBeenLastCalledWith(
      'flock',
      [...sharedLockArgs(), 'buildah', ...storageArgs, 'images', '--quiet'],
      { quiet: true }
    );
  });

  it('shares concurrent and repeated version queries without taking the lock or probing the store', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');
    runMock.mockResolvedValueOnce({
      stdout: 'buildah version 1.39.0\n',
      stderr: '',
    });

    await expect(
      Promise.all([client.version(), client.version()])
    ).resolves.toEqual(['buildah version 1.39.0', 'buildah version 1.39.0']);
    await expect(client.version()).resolves.toBe('buildah version 1.39.0');

    expect(runMock).toHaveBeenCalledExactlyOnceWith('buildah', ['--version'], {
      quiet: true,
    });
    expect(hasCommandMock).not.toHaveBeenCalled();
  });
});

describe('Buildah source date epoch', () => {
  const epochFile = () =>
    join(buildahStoreStateDirectory(), 'source-date-epoch');
  const buildParams = {
    contextDir: '/workspace/api',
    dockerfilePath: '/workspace/api/Dockerfile',
    imageRef: 'vcr.vercel.com/acme/app/api:build-1',
    registry: 'vcr.vercel.com',
    username: 'team_test',
    token: 'registry-token',
    repository: 'api',
    useBuildahStoreCache: true,
  };

  beforeEach(() => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY', '');
    vi.stubEnv('SOURCE_DATE_EPOCH', '');
  });

  it('gives every concurrent service build in a deployment the same epoch', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY', '3');
    const before = Math.floor(Date.now() / 1000);

    const epochs = await Promise.all(
      Array.from({ length: 8 }, () => deploymentSourceDateEpoch())
    );

    expect(new Set(epochs).size).toBe(1);
    expect(Number(epochs[0])).toBeGreaterThanOrEqual(before);
    expect(Number(epochs[0])).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000)
    );
    expect(readdirSync(buildahStoreStateDirectory())).toEqual([
      'source-date-epoch',
    ]);
  });

  it('reuses the epoch an earlier service build published', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY', '3');
    mkdirSync(buildahStoreStateDirectory(), { recursive: true });
    writeFileSync(epochFile(), '1792540800\n');

    await expect(deploymentSourceDateEpoch()).resolves.toBe('1792540800');
  });

  it.each([
    ['unset', ''],
    ['blank', '   '],
    ['1', '1'],
    ['unparseable', 'abc'],
  ])("keeps Buildah's default timestamps while concurrency is %s", async (_case, concurrency) => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY', concurrency);

    await expect(deploymentSourceDateEpoch()).resolves.toBeUndefined();
    expect(existsSync(buildahStoreStateDirectory())).toBe(false);
  });

  it("defers to the project's SOURCE_DATE_EPOCH, which Buildah already applies", async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY', '3');
    vi.stubEnv('SOURCE_DATE_EPOCH', '1700000000');

    await expect(deploymentSourceDateEpoch()).resolves.toBeUndefined();
    expect(existsSync(buildahStoreStateDirectory())).toBe(false);
  });

  it.each([
    [
      'no deployment ID',
      () => {
        vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
      },
    ],
    [
      'an invalid published value',
      () => {
        mkdirSync(buildahStoreStateDirectory(), { recursive: true });
        writeFileSync(epochFile(), 'not-a-number\n');
      },
    ],
  ])('keeps default timestamps when it cannot share an epoch: %s', async (_case, setUp) => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY', '3');
    setUp();

    await expect(deploymentSourceDateEpoch()).resolves.toBeUndefined();
    expect(debugMessages()).toContainEqual(
      expect.stringMatching(/^could not share a Buildah source date epoch: /)
    );
  });

  it('passes the shared epoch to the engine build step only', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY', '3');
    runMock.mockResolvedValue({ stdout: '', stderr: '' });

    await createBuildahEngine(client).build(buildParams);

    const [, buildArgs] = runMock.mock.calls.find(([, args]) =>
      args.includes('build')
    )!;
    const flag = buildArgs.indexOf('--source-date-epoch');
    expect(flag).toBeGreaterThan(buildArgs.indexOf('build'));
    expect(buildArgs[flag + 1]).toBe(readFileSync(epochFile(), 'utf8').trim());
    expect(buildArgs).not.toContain('--timestamp');
    expect(
      runMock.mock.calls.filter(([, args]) =>
        args.includes('--source-date-epoch')
      )
    ).toHaveLength(1);
  });

  it('builds without --source-date-epoch while services build one at a time', async () => {
    runMock.mockResolvedValue({ stdout: '', stderr: '' });

    await createBuildahEngine(client).build(buildParams);

    const [, buildArgs] = runMock.mock.calls.find(([, args]) =>
      args.includes('build')
    )!;
    expect(buildArgs).not.toContain('--source-date-epoch');
  });
});

describe('Buildah schedule images', () => {
  const params: BuildPushParams = {
    contextDir: '/workspace/jobs',
    dockerfilePath: '/workspace/jobs/Dockerfile',
    imageRef: 'vcr.vercel.com/acme/app/jobs:build-1',
    registry: 'vcr.vercel.com',
    username: 'team_test',
    token: 'registry-token',
    repository: 'jobs',
  };
  const localTag = 'vcr.vercel.com/acme/app/jobs:vercel-buildah-store';
  const scheduleImageId = '1'.repeat(64);
  const dispatcherImageId = '2'.repeat(64);

  function flagValue(args: string[], flag: string): string {
    const index = args.indexOf(flag);
    if (index === -1) throw new Error(`${flag} is missing`);
    return args[index + 1];
  }

  async function buildAndPush({
    useBuildahStoreCache,
  }: {
    useBuildahStoreCache: boolean;
  }) {
    const builds: { args: string[]; dockerfile: string }[] = [];
    runMock.mockImplementation(async (_command, args) => {
      if (args.includes('build')) {
        const dockerfile = flagValue(args, '-f');
        builds.push({
          args,
          // The derived Dockerfile is removed once the build returns.
          dockerfile:
            dockerfile === params.dockerfilePath
              ? ''
              : readFileSync(dockerfile, 'utf8'),
        });
        const id = builds.length === 1 ? scheduleImageId : dispatcherImageId;
        return { stdout: `--> ${id}\n`, stderr: '' };
      }
      if (args.includes('push')) {
        writeFileSync(
          flagValue(args, '--digestfile'),
          `sha256:${'a'.repeat(64)}\n`
        );
      }
      return { stdout: '', stderr: '' };
    });
    const engine = createBuildahEngine(client);
    const build = { ...params, useBuildahStoreCache };

    await buildSchedulesCommandImage(engine, build, __filename);
    await engine.push(build);

    expect(builds).toHaveLength(2);
    const [, push] = runMock.mock.calls.find(([, args]) =>
      args.includes('push')
    )!;
    return { schedule: builds[0], dispatcher: builds[1], push };
  }

  it('derives the dispatcher image from the store image without pulling it', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');

    const { schedule, dispatcher, push } = await buildAndPush({
      useBuildahStoreCache: true,
    });

    expect(flagValue(schedule.args, '-t')).toBe(localTag);
    expect(flagValue(dispatcher.args, '-t')).toBe(localTag);
    expect(dispatcher.dockerfile.split('\n')[0]).toBe(`FROM ${localTag}`);
    expect(schedule.args).toContain('--pull=always');
    expect(dispatcher.args).toContain('--pull=never');
    expect(dispatcher.args).not.toContain('--pull=always');
    expect(push.slice(-2)).toEqual([localTag, `docker://${params.imageRef}`]);
  });

  it('records both images for the store cache save', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');

    await buildAndPush({ useBuildahStoreCache: true });

    // The save prunes unrecorded images, and the dispatcher build untags the
    // schedule image.
    const records = await listStateRecords(
      buildahStoreStateDirectory(),
      '.images'
    );
    expect(records.map(record => readFileSync(record, 'utf8')).sort()).toEqual([
      `${scheduleImageId}\n`,
      `${dispatcherImageId}\n`,
    ]);
  });

  it('gives both builds the shared epoch', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY', '3');
    vi.stubEnv('SOURCE_DATE_EPOCH', '');

    const { schedule, dispatcher } = await buildAndPush({
      useBuildahStoreCache: true,
    });

    expect(flagValue(dispatcher.args, '--source-date-epoch')).toBe(
      flagValue(schedule.args, '--source-date-epoch')
    );
  });

  it('derives the dispatcher image from the deployment tag without the store cache', async () => {
    const { schedule, dispatcher, push } = await buildAndPush({
      useBuildahStoreCache: false,
    });

    expect(flagValue(schedule.args, '-t')).toBe(params.imageRef);
    expect(flagValue(dispatcher.args, '-t')).toBe(params.imageRef);
    expect(dispatcher.dockerfile.split('\n')[0]).toBe(
      `FROM ${params.imageRef}`
    );
    expect(schedule.args.some(arg => arg.startsWith('--pull'))).toBe(false);
    expect(dispatcher.args).toContain('--pull=never');
    expect(push.at(-1)).toBe(params.imageRef);
  });
});

describe('startContainerCleanup', () => {
  let child: EventEmitter & { unref: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    spawnMock.mockReturnValue(child);
  });

  it('records cleanup before spawning and unrefs without waiting for exit', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');
    const storageArgs = await buildahStorageArgs();
    let record = '';
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const request = JSON.parse(
        args[args.indexOf(STORE_COMMAND_SCRIPT) + 1]
      ) as StoreCommandRequest;
      expect(request.action).toBe('cleanup');
      if (request.action !== 'cleanup') {
        throw new Error(`unexpected store command action: ${request.action}`);
      }
      record = request.options.record;
      expect(request.options.buildahArgs).toEqual([
        ...storageArgs,
        'rm',
        'vercel-cnb-test',
      ]);
      expect(dirname(record)).toBe(buildahStoreStateDirectory());
      expect(record).toMatch(/\.cleanup$/);
      const stats = lstatSync(record);
      expect(stats.isFile()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
      expect(readFileSync(record, 'utf8')).toBe('vercel-cnb-test\n');
      return child;
    });

    await expect(
      startContainerCleanup('vercel-cnb-test')
    ).resolves.toBeUndefined();

    expect(hasCommandMock).toHaveBeenCalledExactlyOnceWith('flock');
    expect(runMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledExactlyOnceWith(
      'flock',
      [
        ...sharedLockArgs(),
        process.execPath,
        STORE_COMMAND_SCRIPT,
        JSON.stringify({
          action: 'cleanup',
          options: {
            record,
            buildahArgs: [...storageArgs, 'rm', 'vercel-cnb-test'],
          },
        }),
      ],
      { detached: true, stdio: 'ignore' }
    );
    expect(child.unref).toHaveBeenCalledOnce();
  }, 5000);

  it('spawns Buildah directly without cleanup records when caching is disabled', async () => {
    const storageArgs = await buildahStorageArgs();
    const state = buildahStoreStateDirectory();
    expect(existsSync(state)).toBe(false);

    await expect(
      startContainerCleanup('vercel-cnb-test')
    ).resolves.toBeUndefined();

    expect(spawnMock).toHaveBeenCalledExactlyOnceWith(
      'buildah',
      [...storageArgs, 'rm', 'vercel-cnb-test'],
      { detached: true, stdio: 'ignore' }
    );
    expect(runMock).not.toHaveBeenCalled();
    expect(existsSync(state)).toBe(false);
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('falls back to shared-lock Buildah when cleanup registration fails', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');
    const storageArgs = await buildahStorageArgs();
    const state = buildahStoreStateDirectory();
    mkdirSync(dirname(state), { recursive: true });
    writeFileSync(state, 'not a directory');

    await expect(
      startContainerCleanup('vercel-cnb-test')
    ).resolves.toBeUndefined();

    expect(spawnMock).toHaveBeenCalledExactlyOnceWith(
      'flock',
      [...sharedLockArgs(), 'buildah', ...storageArgs, 'rm', 'vercel-cnb-test'],
      { detached: true, stdio: 'ignore' }
    );
    expect(debugMessages()).toContainEqual(
      expect.stringMatching(/^could not record Buildah cleanup: /)
    );
    expect(child.unref).toHaveBeenCalledOnce();
  });
});

describe('creatorArgs', () => {
  const image = {
    version: '1.25.12',
    buildImage: 'docker.io/library/golang:1.25.12-bookworm',
    runImage: 'gcr.io/distroless/cc-debian12',
  };
  const imageRef = 'vcr.vercel.com/acme/app/go:abc';

  it('turns on the lifecycle debug log when asked', () => {
    expect(creatorArgs(image, imageRef, { debug: true })).toContain(
      '-log-level=debug'
    );
  });

  it('keeps the default log level otherwise', () => {
    expect(
      creatorArgs(image, imageRef).some(arg => arg.startsWith('-log-level'))
    ).toBe(false);
  });
});

import type { BuildResultV2Typical } from '@vercel/build-utils';
import { FileBlob, FileFsRef, sanitizeConsumerName } from '@vercel/build-utils';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { create as createTar } from 'tar';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  build,
  CONTAINER_OUTPUT_PATH,
  prepareCache,
  startDevServer,
} from '../src';
import { BuildahStoreCache } from '../src/buildah-store-cache/cache';
import {
  __resetFlockAvailability,
  sharedBuildahStoreLock,
} from '../src/buildah-store-cache/lock';
import { BuildahClient } from '../src/clients/buildah';
import { formatBytes, hasCommand } from '../src/util';
import { __resetStorageDriverCache } from '../src/storage-driver';
import { __resetRunningContainers } from '../src/dev';

const { spawnMock, existsSyncMock, chownSyncMock, lchownSyncMock } = vi.hoisted(
  () => ({
    spawnMock: vi.fn(),
    existsSyncMock: vi.fn(),
    // The builder chowns the lifecycle report dir and the hydrated cache to
    // the CNB uid, which requires root; tests only assert it was requested.
    chownSyncMock: vi.fn(),
    lchownSyncMock: vi.fn(),
  })
);

vi.mock('node:child_process', async importActual => {
  const actual = await importActual<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnMock };
});

// The derived dispatcher image is covered by schedules-command.test.ts.
vi.mock('../src/schedules-command', async importActual => ({
  ...(await importActual<typeof import('../src/schedules-command')>()),
  buildSchedulesCommandImage: (
    engine: { build(params: unknown): Promise<void> },
    params: unknown
  ) => engine.build(params),
}));

vi.mock('node:fs', async importActual => {
  const actual = await importActual<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: existsSyncMock,
    chownSync: chownSyncMock,
    lchownSync: lchownSyncMock,
  };
});

const catchAllRoute = {
  src: '/(.*)',
  dest: `/${CONTAINER_OUTPUT_PATH}`,
  transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
};

/**
 * Project-marker lookups join with the platform separator, so a fixture that
 * describes `/Gemfile` is probed as `\Gemfile` on Windows. Compare on
 * normalized separators so these expectations read the same everywhere.
 */
const toPosixPath = (p: unknown) => String(p).replace(/\\/g, '/');

/** Mock `existsSync` so only the given project markers are present. */
const mockMarkers = (...markers: string[]) => {
  const present = new Set(markers.map(toPosixPath));
  existsSyncMock.mockImplementation((p: unknown) =>
    present.has(toPosixPath(p))
  );
};

const createBuildOptions = (config: Record<string, unknown>) => ({
  files: {},
  entrypoint: 'docker.io/library/nginx:1.27',
  workPath: '/',
  repoRootPath: '/',
  config,
});

/** Build a fake (unsigned) OIDC JWT with the given claims. */
function fakeOidcToken(claims: Record<string, unknown> = {}) {
  const payload = Buffer.from(
    JSON.stringify({
      owner: 'acme',
      owner_id: 'team_test',
      project: 'my-app',
      project_id: 'prj_test',
      iss: 'https://oidc.vercel.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    })
  ).toString('base64url');
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.sig`;
}

const sha256Hex = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/**
 * Seed a project directory with the top-level entries that must never reach
 * the buildpack workspace: VCS metadata and the CLI's pulled env.
 */
function seedExcludedProjectDirs(workPath: string): void {
  mkdirSync(join(workPath, '.git'));
  writeFileSync(join(workPath, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  mkdirSync(join(workPath, '.vercel'));
  writeFileSync(
    join(workPath, '.vercel', '.env.production.local'),
    'VERCEL_OIDC_TOKEN="secret"\n'
  );
}

/** Bytes of a tarball containing `files` (relative path → contents). */
async function tarballBytes(
  files: Record<string, string | Uint8Array | { linkpath: string }>,
  gzip: boolean,
  prefix?: string
): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'vercel-cnb-fixture-'));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, relativePath)), { recursive: true });
      if (typeof contents === 'object' && 'linkpath' in contents) {
        symlinkSync(contents.linkpath, join(dir, relativePath));
      } else {
        writeFileSync(join(dir, relativePath), contents);
      }
    }
    const file = join(tmpdir(), `vercel-cnb-fixture-${basename(dir)}.tar`);
    const topLevel = [...new Set(Object.keys(files).map(p => p.split('/')[0]))];
    try {
      await createTar(
        { file, cwd: dir, gzip, portable: true, prefix },
        topLevel
      );
      return new Uint8Array(readFileSync(file));
    } finally {
      rmSync(file, { force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A minimal lifecycle release archive: `lifecycle/creator` and friends. */
const lifecycleArchiveBytes = () =>
  tarballBytes(
    {
      'lifecycle/creator': { linkpath: 'lifecycle' },
      'lifecycle/lifecycle': '#!/bin/sh\nexit 0\n',
      'lifecycle.toml': '[api]\nplatform = "0.13"\n',
    },
    true
  );

type PinnedBuildpack = import('../src/buildpacks/distribution').PinnedBuildpack;

/**
 * Where the lifecycle expects a packaged buildpack under `/cnb`: `pack` writes
 * `buildpacks/<id with "/" as "_">/<version>/`.
 */
const buildpackDir = (entry: PinnedBuildpack) =>
  `buildpacks/${entry.id.replace('/', '_')}/${entry.version}`;

const buildpackFiles = (entry: PinnedBuildpack) =>
  ['buildpack.toml', 'bin/detect', 'bin/build'].map(
    file => `${buildpackDir(entry)}/${file}`
  );

/**
 * A minimal `pack buildpack package --format file` artifact for the pinned
 * buildpack: an OCI image layout whose single gzip layer holds
 * `/cnb/buildpacks/<id>/<version>/`. With `corruptLayer`, the manifest
 * declares a digest the layer bytes do not match.
 */
async function buildpackageBytes(
  entry: PinnedBuildpack,
  options: { corruptLayer?: boolean; absolute?: boolean } = {}
): Promise<Uint8Array> {
  const [toml, detect, build] = buildpackFiles(entry);
  const layer = await tarballBytes(
    {
      [toml]: `api = "0.10"\n[buildpack]\nid = "${entry.id}"\nversion = "${entry.version}"\n`,
      [detect]: '#!/bin/sh\nexit 0\n',
      [build]: '#!/bin/sh\nexit 0\n',
    },
    true,
    options.absolute === false ? 'cnb' : '/cnb'
  );
  const layerDigest = options.corruptLayer
    ? sha256Hex(new TextEncoder().encode('not the layer'))
    : sha256Hex(layer);
  const config = new TextEncoder().encode('{}');
  const configDigest = sha256Hex(config);
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
      config: {
        mediaType: 'application/vnd.docker.container.image.v1+json',
        size: config.length,
        digest: `sha256:${configDigest}`,
      },
      layers: [
        {
          mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
          size: layer.length,
          digest: `sha256:${layerDigest}`,
        },
      ],
    })
  );
  const manifestDigest = sha256Hex(manifest);
  return tarballBytes(
    {
      'oci-layout': '{"imageLayoutVersion":"1.0.0"}',
      'index.json': JSON.stringify({
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.index.v1+json',
        manifests: [
          {
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            size: manifest.length,
            digest: `sha256:${manifestDigest}`,
          },
        ],
      }),
      [`blobs/sha256/${manifestDigest}`]: manifest,
      [`blobs/sha256/${configDigest}`]: config,
      [`blobs/sha256/${layerDigest}`]: layer,
    },
    false
  );
}

/**
 * Point the pinned distribution at synthesized archives served by the fetch
 * stub. Returns the URL → bytes map and a restore function.
 */
async function stageDistribution(
  ruby: import('../src/buildpacks/registry').BuildpackRuntime,
  options: { corruptLayer?: boolean } = {}
) {
  const { LIFECYCLE, vercelBuildpackArtifact } = await import(
    '../src/buildpacks/distribution'
  );
  const [entry] = ruby.buildpacks;
  const lifecycle = await lifecycleArchiveBytes();
  const buildpackage = await buildpackageBytes(entry, options);
  const original = { lifecycle: LIFECYCLE.sha256, buildpack: entry.sha256 };
  LIFECYCLE.sha256 = sha256Hex(lifecycle);
  entry.sha256 = sha256Hex(buildpackage);
  return {
    archiveContents: new Map<string, Uint8Array>([
      [LIFECYCLE.url, lifecycle],
      [vercelBuildpackArtifact(entry).url, buildpackage],
    ]),
    restore() {
      LIFECYCLE.sha256 = original.lifecycle;
      entry.sha256 = original.buildpack;
    },
  };
}

function stubRegistryFetch(
  fetchMock: ReturnType<typeof vi.fn>,
  options: {
    repositoryStatus?: number;
    mintStatus?: number;
    archiveContents?: ReadonlyMap<string, Uint8Array>;
  } = {}
) {
  const repositoryStatus = options.repositoryStatus ?? 200;
  const mintStatus = options.mintStatus ?? 200;
  fetchMock.mockImplementation((url: string | URL) => {
    const href = String(url);
    const archiveContents = options.archiveContents?.get(href);
    if (archiveContents) {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => Uint8Array.from(archiveContents).buffer,
      });
    }
    if (href.includes('/v1/projects/') && href.includes('/token')) {
      const projectId =
        href.match(/\/projects\/([^/?]+)\/token/)?.[1] ?? 'prj_test';
      const token = fakeOidcToken({
        project_id: projectId,
        owner_id: 'team_test',
      });
      return Promise.resolve({
        ok: mintStatus >= 200 && mintStatus < 300,
        status: mintStatus,
        json: async () => ({ token }),
        text: async () =>
          mintStatus === 403 ? 'Forbidden' : JSON.stringify({ token }),
      });
    }
    if (href.includes('/v1/vcr/repository')) {
      return Promise.resolve({
        ok: repositoryStatus >= 200 && repositoryStatus < 300,
        status: repositoryStatus,
        text: async () => '',
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () => '',
    });
  });
}

/** Fake child process that exits with a failure code. */
function fakeChildFailure(stderr = '', code = 1) {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: vi.fn() };
  child.unref = vi.fn();
  setImmediate(() => {
    if (stderr) {
      child.stderr.emit('data', Buffer.from(stderr));
    }
    child.emit('close', code);
  });
  return child;
}

/**
 * Fake long-running child process (e.g. `docker run`) that stays alive until
 * `.kill()`/emit. Used for dev-server tests where the container must not exit.
 */
function fakeRunningChild(pid = 4242) {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: vi.fn() };
  child.pid = pid;
  child.exitCode = null;
  child.kill = vi.fn();
  child.unref = vi.fn();
  return child;
}

/** Fake child process that emits the given stdout, then exits successfully. */
function fakeChild(stdout = '') {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: vi.fn() };
  child.unref = vi.fn();
  setImmediate(() => {
    if (stdout) {
      child.stdout.emit('data', Buffer.from(stdout));
    }
    child.emit('close', 0);
  });
  return child;
}

const VCR_ENV_KEYS = [
  'VERCEL_OIDC_TOKEN',
  'VERCEL_TOKEN',
  'VERCEL_API_URL',
  'VERCEL_BUILD_IMAGE',
  'VERCEL_CONTAINER_ENGINE',
  'VERCEL_VCR_DOCKER_STORAGE_DRIVER',
  'VERCEL_VCR_STRICT_STORAGE',
  'VERCEL_VCR_FORCE_LOGIN',
  'VERCEL_BUILDPACK_PRERELEASE_URL',
  'VERCEL_BUILDAH_STORE_CACHE',
  'VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY',
  'SOURCE_DATE_EPOCH',
  'VERCEL_DEPLOYMENT_ID',
  'REGISTRY_AUTH_FILE',
  'XDG_CONFIG_HOME',
];

beforeEach(() => {
  existsSyncMock.mockReturnValue(false);
  spawnMock.mockReset();
  chownSyncMock.mockReset();
  lchownSyncMock.mockReset();
  __resetStorageDriverCache();
  __resetFlockAvailability();
  __resetRunningContainers();
  for (const key of VCR_ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of VCR_ENV_KEYS) {
    delete process.env[key];
  }
  vi.unstubAllGlobals();
});

function expectTypicalBuildResult(
  result: Awaited<ReturnType<typeof build>>
): BuildResultV2Typical {
  expect(result).toHaveProperty('output');
  return result as BuildResultV2Typical;
}

describe('hasCommand', () => {
  it('checks PATH quietly and returns true when the command is available', async () => {
    spawnMock.mockReturnValue(fakeChild('/usr/bin/flock\n'));

    await expect(hasCommand('flock')).resolves.toBe(true);
    expect(spawnMock).toHaveBeenCalledExactlyOnceWith('which', ['flock'], {
      cwd: undefined,
      env: undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  it('returns false when the command is not on PATH', async () => {
    spawnMock.mockReturnValue(fakeChildFailure());

    await expect(hasCommand('missing-command')).resolves.toBe(false);
  });

  it('returns false when the lookup cannot be started', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('lookup unavailable');
    });

    await expect(hasCommand('flock')).resolves.toBe(false);
  });
});

describe('formatBytes', () => {
  it.each([
    { bytes: 0, expected: '0 B' },
    { bytes: 1023, expected: '1023 B' },
    { bytes: 1024, expected: '1.0 KiB' },
    { bytes: 9 * 1024, expected: '9.0 KiB' },
    { bytes: 10 * 1024, expected: '10 KiB' },
    { bytes: 1024 ** 2, expected: '1.0 MiB' },
    { bytes: 10 * 1024 ** 2, expected: '10 MiB' },
    { bytes: 1024 ** 3, expected: '1.0 GiB' },
  ])('formats $bytes bytes as $expected', ({ bytes, expected }) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('@vercel/container', () => {
  it('passes the container image reference through as build output', async () => {
    const result = await build(
      createBuildOptions({ handler: 'docker.io/library/nginx:1.27' })
    );

    expect(result).toEqual({
      routes: [{ handle: 'filesystem' }, catchAllRoute],
      output: {
        [CONTAINER_OUTPUT_PATH]: {
          type: 'Lambda',
          files: {},
          handler: 'docker.io/library/nginx:1.27',
          runtime: 'container',
          environment: {},
        },
      },
    });
  });

  it('copies the resolved rewrite destination into the request path', async () => {
    // Rewrites only change the path Vercel matches; without this transform the
    // container keeps seeing the original request path.
    const result = expectTypicalBuildResult(
      await build(
        createBuildOptions({ handler: 'docker.io/library/nginx:1.27' })
      )
    );

    expect(result.routes?.[1]).toMatchObject({
      transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
    });
  });

  it('does not park the function at `index`', () => {
    // The filesystem handler resolves `/` to an `index` output, which would
    // dispatch a rewrite landing on `/` before the transform above can run.
    expect(CONTAINER_OUTPUT_PATH).not.toBe('index');
  });

  it('applies matching function configuration to the build output', async () => {
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({
          functions: {
            'docker.io/library/nginx:*': {
              memory: 2048,
              maxDuration: 120,
              regions: ['iad1'],
            },
          },
        }),
        entrypoint: 'docker.io/library/nginx:1.27',
      })
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      handler: 'docker.io/library/nginx:1.27',
      runtime: 'container',
      memory: 2048,
      maxDuration: 120,
      regions: ['iad1'],
    });
  });

  it('applies per-service function configuration scoped by service name', async () => {
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({
          functions: {
            'docker.io/library/nginx:*': {
              memory: 4096,
              experimentalTriggers: [{ type: 'queue/v2beta', topic: 'jobs' }],
            },
          },
          serviceName: 'api',
        }),
        entrypoint: 'docker.io/library/nginx:1.27',
        service: { name: 'api' },
      })
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      memory: 4096,
      experimentalTriggers: [
        {
          type: 'queue/v2beta',
          topic: 'jobs',
          consumer: sanitizeConsumerName('api~docker.io/library/nginx:*'),
        },
      ],
    });
  });

  it('does not rewrite image references without registry', async () => {
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({}),
        entrypoint: 'grycap/cowsay:latest',
      })
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      handler: 'grycap/cowsay:latest',
      runtime: 'container',
    });
  });

  it('normalizes a string command override to argv array form', async () => {
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({ command: 'nginx -g daemon off;' }),
        entrypoint: 'docker.io/library/nginx:1.27',
      })
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      handler: 'docker.io/library/nginx:1.27',
      command: ['nginx -g daemon off;'],
    });
  });

  it('does a normal build with a catch-all route for services', async () => {
    // The function keeps its plain output path (no `_svc` namespacing) so the
    // nested `services/<name>/` output "just works", with a catch-all route to
    // reach it.
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({}),
        entrypoint: 'docker.io/library/nginx:1.27',
        service: {
          name: 'api',
        },
      })
    );

    expect(result.output).toHaveProperty(CONTAINER_OUTPUT_PATH);
    expect(result.output).not.toHaveProperty('_svc/api/index');
    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      handler: 'docker.io/library/nginx:1.27',
      runtime: 'container',
      environment: {},
    });

    // Without a catch-all, a request to the service root never reaches the
    // Lambda inside the isolated per-service route table.
    expect(result.routes).toEqual([{ handle: 'filesystem' }, catchAllRoute]);
  });

  it('emits the catch-all route for non-service builds too', async () => {
    // A root container deploy (no service) still needs the catch-all so a
    // request to `/` reaches the function.
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({}),
        entrypoint: 'docker.io/library/nginx:1.27',
      })
    );

    expect(result.output).toHaveProperty(CONTAINER_OUTPUT_PATH);
    expect(result.routes).toEqual([{ handle: 'filesystem' }, catchAllRoute]);
  });

  function unwrapSharedLock(cmd: string, args: string[]): [string, string[]] {
    return cmd === 'flock' && args[0] === '--shared'
      ? ['buildah', args.slice(args.indexOf('buildah') + 1)]
      : [cmd, args];
  }

  async function runDockerfileBuild(options?: {
    buildImageEnv?: string;
    engineOverride?: string;
    /** Override the simulated `buildah info` store object. */
    storeInfo?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    /**
     * When true, simulate the build container having provisioned a registry
     * auth file (vercel/api#76560), so the builder skips the explicit login.
     */
    authFilePresent?: boolean;
    /** Override the service entrypoint (e.g. a `Containerfile` to build). */
    entrypoint?: string;
    /** The work path and repository root; `/` by default. */
    root?: string;
    /** Called for every spawned command, while it runs. */
    onSpawn?: (cmd: string, args: string[]) => void;
  }) {
    if (options?.buildImageEnv) {
      process.env.VERCEL_BUILD_IMAGE = options.buildImageEnv;
    }
    if (options?.engineOverride) {
      process.env.VERCEL_CONTAINER_ENGINE = options.engineOverride;
    }
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    // Everything exists (Dockerfile, store dir, …) except the registry auth
    // file, which is only present when the build container provisioned it.
    existsSyncMock.mockImplementation((p: unknown) => {
      if (
        typeof p === 'string' &&
        basename(p) === 'auth.json' &&
        basename(dirname(p)) === 'containers'
      ) {
        return Boolean(options?.authFilePresent);
      }
      return true;
    });
    // Simulate `buildah info` reporting the intended store: native overlay with
    // the graphroot under the XFS /vercel volume. Tests can override via
    // `storeInfo`.
    const storeInfo = options?.storeInfo ?? {
      GraphRoot: '/vercel/.containers/storage',
      RunRoot: '/run/containers/storage',
      GraphDriverName: 'overlay',
      GraphStatus: { 'Backing Filesystem': 'xfs' },
    };
    const digest = `sha256:${'a'.repeat(64)}`;
    spawnMock.mockImplementation((cmd: string, args: string[]) => {
      options?.onSpawn?.(cmd, args);
      [cmd, args] = unwrapSharedLock(cmd, args);
      if (cmd === 'buildah' && args.includes('info')) {
        return fakeChild(JSON.stringify({ store: storeInfo }));
      }
      if (args.includes('push')) {
        if (cmd === 'buildah') {
          const digestIdx = args.indexOf('--digestfile');
          if (digestIdx >= 0) {
            writeFileSync(args[digestIdx + 1], `${digest}\n`);
          }
          return fakeChild('');
        }
        return fakeChild(`latest: digest: ${digest} size: 1234\n`);
      }
      return fakeChild('');
    });

    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({ runtime: 'container' }),
        ...(options?.entrypoint ? { entrypoint: options.entrypoint } : {}),
        ...(options?.root
          ? { workPath: options.root, repoRootPath: options.root }
          : {}),
        service: { name: 'api' },
        ...(options?.meta ? { meta: options.meta } : {}),
      } as any)
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      type: 'Lambda',
      runtime: 'container',
      handler: `vcr.vercel.com/acme/my-app/api@${digest}`,
    });

    return spawnMock.mock.calls.map(call => {
      const [cmd, args] = unwrapSharedLock(...(call as [string, string[]]));
      return `${cmd} ${args.join(' ')}`;
    });
  }

  it('builds a Dockerfile with docker locally, pushes to VCR, and emits the digest reference', async () => {
    const commands = await runDockerfileBuild();
    const loginIndex = commands.findIndex(c => c.includes('login'));
    const buildIndex = commands.findIndex(c => c.startsWith('docker build'));
    expect(loginIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(loginIndex);
    expect(
      commands.some(
        c =>
          c.includes('login') &&
          c.includes('--username team_test') &&
          c.includes('--password-stdin')
      )
    ).toBe(true);
    expect(
      commands.some(c =>
        c.startsWith('docker push vcr.vercel.com/acme/my-app/api')
      )
    ).toBe(true);
  });

  // Unlike services, which build from the Dockerfile's directory.
  it("builds a schedule command's image with its root as the build context", async () => {
    await runDockerfileBuild();
    spawnMock.mockClear();
    await build({
      files: {},
      entrypoint: 'jobs/docker/Dockerfile',
      workPath: '/project',
      repoRootPath: '/project',
      config: { schedulesCommand: { root: 'jobs', command: ['/job'] } },
      service: { name: 'nightly' },
    } as any);
    const imageBuild = spawnMock.mock.calls
      .map(([cmd, args]) => toPosixPath(`${cmd} ${args.join(' ')}`))
      .find(command => command.startsWith('docker build'));
    expect(imageBuild).toMatch(
      / -f \/project\/jobs\/docker\/Dockerfile \/project\/jobs$/
    );
  });

  it('builds a portless daemon image without emitting a Function or route', async () => {
    await runDockerfileBuild();
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({
          daemon: {
            name: 'scheduler',
            root: '.',
            entrypoint: 'Dockerfile',
            instances: { sfo1: 1 },
            command: ['python', '-m', 'scheduler'],
            terminationGracePeriodSeconds: 60,
            livenessProbe: { httpGet: { port: 8080 } },
          },
        }),
        entrypoint: 'Dockerfile',
      })
    );
    expect(result.output).toEqual({});
    expect(result.routes).toBeUndefined();
    expect(result.daemons).toEqual({
      scheduler: {
        runtime: 'container',
        image: `vcr.vercel.com/acme/my-app/daemon.scheduler@sha256:${'a'.repeat(64)}`,
        instances: { sfo1: 1 },
        command: ['python', '-m', 'scheduler'],
        terminationGracePeriodSeconds: 60,
        livenessProbe: { httpGet: { port: 8080 } },
      },
    });
  });

  it.each([
    [
      'a daemon, from the Dockerfile directory',
      {
        daemon: {
          name: 'scheduler',
          root: '.',
          entrypoint: 'docker/Dockerfile',
          instances: { sfo1: 1 },
        },
      },
      '/project/backend/docker',
    ],
    ['a service, from the Dockerfile directory', {}, '/project/backend/docker'],
  ])('builds the Dockerfile of %s', async (_case, config, context) => {
    await runDockerfileBuild();
    spawnMock.mockClear();
    await build({
      ...createBuildOptions(config),
      entrypoint: 'docker/Dockerfile',
      workPath: '/project/backend',
    });
    const dockerBuild = (spawnMock.mock.calls as [string, string[]][]).find(
      ([cmd, args]) => cmd === 'docker' && args[0] === 'build'
    );
    expect(dockerBuild?.[1].slice(-3)).toEqual([
      '-f',
      join(context, 'Dockerfile'),
      join(context),
    ]);
  });

  it('emits daemon bindings in the daemon descriptor', async () => {
    await runDockerfileBuild();
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({
          daemon: {
            name: 'scheduler',
            root: '.',
            entrypoint: 'Dockerfile',
            instances: { sfo1: 1 },
            bindings: [
              {
                type: 'service',
                service: 'api',
                format: 'url',
                env: 'API_URL',
              },
              {
                type: 'service',
                service: 'billing',
                format: 'url',
                env: 'BILLING_URL',
              },
            ],
          },
        }),
        entrypoint: 'Dockerfile',
      })
    );
    expect(result.daemons?.scheduler?.bindings).toEqual([
      { type: 'service', service: 'api', format: 'url', env: 'API_URL' },
      {
        type: 'service',
        service: 'billing',
        format: 'url',
        env: 'BILLING_URL',
      },
    ]);
  });

  it('omits bindings for a daemon that declares none', async () => {
    await runDockerfileBuild();
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({
          daemon: {
            name: 'scheduler',
            root: '.',
            entrypoint: 'Dockerfile',
            instances: { sfo1: 1 },
            bindings: [],
          },
        }),
        entrypoint: 'Dockerfile',
      })
    );
    expect(result.daemons?.scheduler).not.toHaveProperty('bindings');
  });

  it('emits the registry digest when Docker push omits its summary and the local digest differs', async () => {
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
    existsSyncMock.mockReturnValue(true);
    const localDigest = `sha256:${'b'.repeat(64)}`;
    const registryDigest = `sha256:${'a'.repeat(64)}`;
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock);
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        expect(url).toMatch(
          /^https:\/\/vcr\.vercel\.com\/v2\/acme\/my-app\/api\/manifests\//
        );
        return Promise.resolve(
          new Response(null, {
            headers: { 'Docker-Content-Digest': registryDigest },
          })
        );
      }
      return fetchMock(url, init);
    });
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('push')) {
        return fakeChild(`Copying config ${localDigest}\nWriting manifest\n`);
      }
      if (args.includes('inspect')) {
        return fakeChild(`vcr.vercel.com/acme/my-app/api@${localDigest}\n`);
      }
      return fakeChild('');
    });

    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({ runtime: 'container' }),
        service: { name: 'api' },
      })
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      runtime: 'container',
      handler: `vcr.vercel.com/acme/my-app/api@${registryDigest}`,
    });
    expect(
      spawnMock.mock.calls.some(([, args]) => args.includes('inspect'))
    ).toBe(false);
  });

  it.each([
    '',
    'not-a-digest\n',
  ])('emits the registry digest when buildah --digestfile holds %j', async digestFileContents => {
    process.env.VERCEL_BUILD_IMAGE = 'al2023';
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
    existsSyncMock.mockReturnValue(true);
    const registryDigest = `sha256:${'a'.repeat(64)}`;
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock);
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        expect(url).toMatch(
          /^https:\/\/vcr\.vercel\.com\/v2\/acme\/my-app\/api\/manifests\//
        );
        return Promise.resolve(
          new Response(null, {
            headers: { 'Docker-Content-Digest': registryDigest },
          })
        );
      }
      return fetchMock(url, init);
    });
    spawnMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'buildah' && args.includes('info')) {
        return fakeChild(
          JSON.stringify({
            store: {
              GraphRoot: '/vercel/.containers/storage',
              RunRoot: '/run/containers/storage',
              GraphDriverName: 'overlay',
              GraphStatus: { 'Backing Filesystem': 'xfs' },
            },
          })
        );
      }
      if (cmd === 'buildah' && args.includes('push')) {
        writeFileSync(
          args[args.indexOf('--digestfile') + 1],
          digestFileContents
        );
        return fakeChild('');
      }
      return fakeChild('');
    });

    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({ runtime: 'container' }),
        service: { name: 'api' },
      })
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      runtime: 'container',
      handler: `vcr.vercel.com/acme/my-app/api@${registryDigest}`,
    });
  });

  it('fails the build instead of emitting a tag when the pushed digest cannot be resolved', async () => {
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
    existsSyncMock.mockReturnValue(true);
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock);
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      init?.method === 'HEAD'
        ? Promise.resolve(new Response(null, { status: 401 }))
        : fetchMock(url, init)
    );
    spawnMock.mockImplementation((_cmd: string, args: string[]) =>
      fakeChild(args.includes('push') ? 'Writing manifest\n' : '')
    );

    await expect(
      build({
        ...createBuildOptions({ runtime: 'container' }),
        service: { name: 'api' },
      })
    ).rejects.toThrow(
      /^Image vcr\.vercel\.com\/acme\/my-app\/api:\S+ was pushed, but its registry digest could not be resolved: Registry returned HTTP 401\.$/
    );
  });

  it('uses buildah in the Vercel build container', async () => {
    const commands = await runDockerfileBuild({
      buildImageEnv: 'al2023',
    });
    expect(commands.some(c => /\bbuildah\b.*\bbuild\b/.test(c))).toBe(true);
    // RUN steps must use host networking; the Hive cell can't program iptables
    // for buildah's default rootless network.
    expect(
      commands.some(c => /\bbuildah\b.*\bbuild\b.*--network host/.test(c))
    ).toBe(true);
    // Per-instruction layer caching must be enabled.
    expect(commands.some(c => /\bbuildah\b.*\bbuild\b.*--layers/.test(c))).toBe(
      true
    );
    expect(commands.some(c => /\bbuildah\b.*\blogin\b/.test(c))).toBe(true);
    expect(commands.some(c => /\bbuildah\b.*\bpush\b/.test(c))).toBe(true);
    // Push with zstd compression so server-side VHS conversion is faster.
    expect(
      commands.some(
        c =>
          /\bbuildah\b.*\bpush\b/.test(c) &&
          c.includes('--compression-format zstd')
      )
    ).toBe(true);
    expect(commands.some(c => c.includes('--registries-conf'))).toBe(true);
    // Defer to /etc/containers/storage.conf (native overlay on /vercel); we
    // must NOT force a --storage-driver.
    expect(commands.some(c => c.includes('--storage-driver'))).toBe(false);
    expect(
      commands.some(c => c.includes('--root /vercel/.containers/storage'))
    ).toBe(true);
    expect(commands.some(c => c.startsWith('docker build'))).toBe(false);
  });

  it('queries Buildah metadata again for each build in the same process', async () => {
    const first = await runDockerfileBuild({ buildImageEnv: 'al2023' });
    expect(first.filter(c => c === 'buildah --version')).toHaveLength(1);
    expect(first.filter(c => /^buildah\b.*\binfo\b/.test(c))).toHaveLength(1);

    spawnMock.mockClear();
    const second = await runDockerfileBuild({ buildImageEnv: 'al2023' });
    expect(second.filter(c => c === 'buildah --version')).toHaveLength(1);
    expect(second.filter(c => /^buildah\b.*\binfo\b/.test(c))).toHaveLength(1);
  });

  describe('Buildah store cache', () => {
    let root: string;
    const snapshotDirectory = () =>
      join(root, '.vercel', 'cache', 'buildah-store');
    const cacheEntries = () => readdirSync(join(root, '.vercel', 'cache'));
    const buildahBuild = (commands: string[]) =>
      commands.find(c => /^buildah\b.*\bbuild\b/.test(c))!;
    const buildahPush = (commands: string[]) =>
      commands.find(c => /^buildah\b.*\bpush\b/.test(c))!;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'vercel-store-cache-build-'));
      mkdirSync(snapshotDirectory(), { recursive: true });
      writeFileSync(
        join(snapshotDirectory(), `store-${'a'.repeat(32)}.tar.zst`),
        'previous snapshot'
      );
      process.env.VERCEL_DEPLOYMENT_ID = basename(root);
    });
    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
      rmSync(join(tmpdir(), 'vercel-buildah-store', basename(root)), {
        recursive: true,
        force: true,
      });
    });

    it('restores the shared store before Dockerfile toolchain setup', async () => {
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      const restore = vi
        .spyOn(BuildahStoreCache.prototype, 'restore')
        .mockResolvedValue(undefined);
      try {
        await runDockerfileBuild({
          buildImageEnv: 'al2023',
          root,
          onSpawn: () => expect(restore).toHaveBeenCalledOnce(),
        });
        expect(restore).toHaveBeenCalledOnce();
      } finally {
        restore.mockRestore();
      }
    });

    it('shares one version query across restore keying and Dockerfile diagnostics', async () => {
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      const commands = await runDockerfileBuild({
        buildImageEnv: 'al2023',
        root,
        onSpawn: (_cmd, args) => {
          if (args.includes('info')) expect(cacheEntries()).toEqual([]);
        },
      });
      const versionQueries = commands.filter(c => c === 'buildah --version');
      const infoQueries = commands.filter(c => /^buildah\b.*\binfo\b/.test(c));
      expect(versionQueries).toHaveLength(1);
      expect(infoQueries).toHaveLength(1);
      const restoreIndex = commands.findIndex(c =>
        c.includes('"action":"restore"')
      );
      expect(restoreIndex).toBeGreaterThan(
        commands.indexOf('buildah --version')
      );
      expect(commands.indexOf(infoQueries[0])).toBeGreaterThan(restoreIndex);
    });

    it('restores the shared store before dispatching a buildpack build', async () => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      const restore = vi
        .spyOn(BuildahStoreCache.prototype, 'restore')
        .mockResolvedValue(undefined);
      const buildpackModule = await import('../src/buildpacks/build');
      const buildpackBuild = vi
        .spyOn(buildpackModule, 'buildAndPushBuildpack')
        .mockImplementation(async () => {
          expect(restore).toHaveBeenCalledOnce();
          return `vcr.vercel.com/acme/my-app/web@sha256:${'a'.repeat(64)}`;
        });
      try {
        await build({
          ...createBuildOptions({ buildpack: 'ruby', framework: 'ruby' }),
          entrypoint: '<detect>',
          workPath: root,
          repoRootPath: root,
          service: { name: 'web' },
        });
        expect(buildpackBuild).toHaveBeenCalledOnce();
        expect(restore).toHaveBeenCalledOnce();
      } finally {
        buildpackBuild.mockRestore();
        restore.mockRestore();
      }
    });

    it.each([
      {
        mode: 'prebuilt',
        entrypoint: 'docker.io/library/nginx:1.27',
        config: { handler: 'docker.io/library/nginx:1.27' },
        meta: {},
      },
      {
        mode: 'development',
        entrypoint: 'Dockerfile',
        config: {},
        meta: { isDev: true },
      },
    ])('leaves the store and its snapshot alone for $mode builds', async ({
      entrypoint,
      config,
      meta,
    }) => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      const restore = vi.spyOn(BuildahStoreCache.prototype, 'restore');
      try {
        await build({
          ...createBuildOptions(config),
          entrypoint,
          workPath: root,
          repoRootPath: root,
          meta,
        });
        expect(restore).not.toHaveBeenCalled();
        expect(spawnMock).not.toHaveBeenCalled();
        expect(cacheEntries()).toEqual(['buildah-store']);
      } finally {
        restore.mockRestore();
      }
    });

    it('leaves the store cache alone for the Docker engine', async () => {
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      const restore = vi.spyOn(BuildahStoreCache.prototype, 'restore');
      try {
        await runDockerfileBuild({
          buildImageEnv: 'al2023',
          engineOverride: 'docker',
          root,
        });
        expect(restore).not.toHaveBeenCalled();
        expect(cacheEntries()).toEqual(['buildah-store']);
      } finally {
        restore.mockRestore();
      }
    });

    it('removes the snapshot from the build context and keeps Buildah ignore files when enabled', async () => {
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      writeFileSync(join(root, 'Dockerfile.dockerignore'), '.env\n');
      let entriesDuringBuild: string[] = [];
      const commands = await runDockerfileBuild({
        buildImageEnv: 'al2023',
        entrypoint: 'Dockerfile',
        root,
        onSpawn: (cmd, args) => {
          if (cmd === 'flock' && args.includes('build')) {
            entriesDuringBuild = cacheEntries();
          }
        },
      });

      expect(entriesDuringBuild).toEqual([]);
      expect(buildahBuild(commands)).toContain('--layers');
      expect(buildahBuild(commands)).toContain('--force-rm');
      expect(buildahBuild(commands)).toContain('--pull=always');
      expect(buildahBuild(commands)).not.toContain('--ignorefile');
      expect(buildahBuild(commands)).toContain(
        '-t vcr.vercel.com/acme/my-app/api:vercel-buildah-store'
      );
      expect(buildahPush(commands)).toContain(
        `vcr.vercel.com/acme/my-app/api:vercel-buildah-store docker://vcr.vercel.com/acme/my-app/api:${basename(root)}`
      );
      expect(readFileSync(join(root, 'Dockerfile.dockerignore'), 'utf8')).toBe(
        '.env\n'
      );
    });

    it.each([
      undefined,
      '0',
    ])('only removes a leftover snapshot when the flag is %s', async flag => {
      if (flag !== undefined) {
        process.env.VERCEL_BUILDAH_STORE_CACHE = flag;
      }
      let entriesDuringBuild: string[] = [];
      const commands = await runDockerfileBuild({
        buildImageEnv: 'al2023',
        entrypoint: 'Dockerfile',
        root,
        onSpawn: (cmd, args) => {
          if (cmd === 'buildah' && args.includes('build')) {
            entriesDuringBuild = cacheEntries();
          }
        },
      });

      expect(entriesDuringBuild).toEqual([]);
      expect(buildahBuild(commands)).not.toContain('--ignorefile');
      expect(buildahBuild(commands)).not.toContain('--pull=always');
      expect(buildahBuild(commands)).toContain(
        `-t vcr.vercel.com/acme/my-app/api:${basename(root)} `
      );
      expect(buildahPush(commands)).not.toContain('docker://');
      expect(spawnMock.mock.calls.some(([cmd]) => cmd === 'flock')).toBe(false);
      expect(
        readdirSync(tmpdir()).includes('vercel-buildah-store') &&
          readdirSync(join(tmpdir(), 'vercel-buildah-store')).includes(
            basename(root)
          )
      ).toBe(false);
    });

    it('stays off without a deployment ID', async () => {
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      delete process.env.VERCEL_DEPLOYMENT_ID;
      const restore = vi.spyOn(BuildahStoreCache.prototype, 'restore');
      try {
        const commands = await runDockerfileBuild({
          buildImageEnv: 'al2023',
          root,
        });
        expect(restore).not.toHaveBeenCalled();
        expect(cacheEntries()).toEqual([]);
        expect(buildahBuild(commands)).not.toContain('--pull=always');
        expect(spawnMock.mock.calls.some(([cmd]) => cmd === 'flock')).toBe(
          false
        );
      } finally {
        restore.mockRestore();
      }
    });

    it('builds uncached when the cache cannot be set up', async () => {
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      rmSync(join(root, '.vercel'), { recursive: true });
      writeFileSync(join(root, '.vercel'), 'not a directory');
      const commands = await runDockerfileBuild({
        buildImageEnv: 'al2023',
        root,
      });
      expect(buildahBuild(commands)).toContain('--layers');
      expect(buildahPush(commands)).toContain('docker://');
    });
  });

  it('skips the explicit login when the build container provisioned an auth file', async () => {
    // vercel/api#76560 writes ~/.config/containers/auth.json before the
    // builder runs; buildah picks it up automatically, so we must not run a
    // redundant `buildah login` that could clobber those credentials.
    const commands = await runDockerfileBuild({
      buildImageEnv: 'al2023',
      authFilePresent: true,
    });
    expect(commands.some(c => /\bbuildah\b.*\blogin\b/.test(c))).toBe(false);
    // The build still proceeds and pushes.
    expect(commands.some(c => /\bbuildah\b.*\bpush\b/.test(c))).toBe(true);
  });

  it('forces an explicit login under VERCEL_VCR_FORCE_LOGIN even with an auth file', async () => {
    process.env.VERCEL_VCR_FORCE_LOGIN = '1';
    const commands = await runDockerfileBuild({
      buildImageEnv: 'al2023',
      authFilePresent: true,
    });
    expect(commands.some(c => /\bbuildah\b.*\blogin\b/.test(c))).toBe(true);
  });

  it('builds from a Containerfile entrypoint, passing it via -f', async () => {
    // A `Containerfile` entrypoint is built the same as a `Dockerfile`; the
    // resolved path is handed to `buildah build -f <path>`.
    const commands = await runDockerfileBuild({
      buildImageEnv: 'al2023',
      entrypoint: 'Containerfile',
    });
    expect(
      commands.some(
        c => /\bbuildah\b.*\bbuild\b/.test(c) && /-f \S*Containerfile\b/.test(c)
      )
    ).toBe(true);
    expect(commands.some(c => /\bbuildah\b.*\bpush\b/.test(c))).toBe(true);
  });

  it.each([
    'Dockerfile.vercel',
    'Containerfile.vercel',
    'Dockerfile.worker',
    'Containerfile.scheduler',
    'worker_Dockerfile',
  ])('builds from the explicit `%s` entrypoint, passing it via -f', async marker => {
    const commands = await runDockerfileBuild({
      buildImageEnv: 'al2023',
      entrypoint: marker,
    });
    const escaped = marker.replace('.', '\\.');
    expect(
      commands.some(
        c =>
          /\bbuildah\b.*\bbuild\b/.test(c) &&
          new RegExp(`-f \\S*${escaped}\\b`).test(c)
      )
    ).toBe(true);
    expect(commands.some(c => /\bbuildah\b.*\bpush\b/.test(c))).toBe(true);
  });

  it('discovers a `Dockerfile.vercel` marker when the entrypoint is `<detect>`', async () => {
    // The `container` framework preset resolves its entrypoint via `<detect>`;
    // the builder must then find the `.vercel` marker in the work directory.
    const commands = await runDockerfileBuild({
      buildImageEnv: 'al2023',
      entrypoint: '<detect>',
    });
    expect(
      commands.some(
        c =>
          /\bbuildah\b.*\bbuild\b/.test(c) &&
          /-f \S*Dockerfile\.vercel\b/.test(c)
      )
    ).toBe(true);
  });

  it('builds a root (non-service) container deploy without a service name', async () => {
    // A `Dockerfile.vercel` at the project root deploys as a container with no
    // service; the repository leaf is derived from the Dockerfile base name
    // (`Dockerfile.vercel` -> `dockerfile`) instead of throwing.
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    existsSyncMock.mockReturnValue(true);
    const digest = `sha256:${'a'.repeat(64)}`;
    spawnMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'buildah' && args.includes('info')) {
        return fakeChild(
          JSON.stringify({
            store: {
              GraphRoot: '/vercel/.containers/storage',
              RunRoot: '/run/containers/storage',
              GraphDriverName: 'overlay',
              GraphStatus: { 'Backing Filesystem': 'xfs' },
            },
          })
        );
      }
      if (args.includes('push')) {
        return fakeChild(`latest: digest: ${digest} size: 1234\n`);
      }
      return fakeChild('');
    });

    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({ runtime: 'container' }),
        entrypoint: 'Dockerfile.vercel',
      } as any)
    );

    // No service name, so the output sits at the top level with the catch-all
    // so `/` reaches it. Repository leaf comes from the Dockerfile base name
    // (`dockerfile`).
    expect(result.output).toHaveProperty(CONTAINER_OUTPUT_PATH);
    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      type: 'Lambda',
      runtime: 'container',
      handler: `vcr.vercel.com/acme/my-app/dockerfile@${digest}`,
    });
    expect(result.routes).toEqual([{ handle: 'filesystem' }, catchAllRoute]);
  });

  it('forwards the project build env to the image build as --build-arg', async () => {
    const commands = await runDockerfileBuild({
      buildImageEnv: 'al2023',
      meta: { buildEnv: { MY_BUILD_VAR: 'hello', OTHER: 'world' } },
    });
    expect(
      commands.some(
        c =>
          /\bbuildah\b.*\bbuild\b/.test(c) &&
          c.includes('--build-arg MY_BUILD_VAR=hello') &&
          c.includes('--build-arg OTHER=world')
      )
    ).toBe(true);
  });

  it('build() in dev returns a local tag without pushing to a registry', async () => {
    // `vercel dev` runs the container builder's `build()` with `meta.isDev`.
    // Containers are always built from a Dockerfile (there is no prebuilt-image
    // input), and the real local build/run happens in `startDevServer`, so the
    // `build()` path must not push to a registry and must never throw.
    existsSyncMock.mockReturnValue(true); // Dockerfile present
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({ runtime: 'container' }),
        entrypoint: '<detect>',
        service: { name: 'api' },
        meta: { isDev: true },
      } as any)
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      type: 'Lambda',
      runtime: 'container',
      handler: 'vercel-dev/api:dev',
    });
    // No image build/push in dev: nothing is spawned and the registry is
    // never contacted.
    expect(spawnMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('storage verification is observability-only by default (does not fail the build)', async () => {
    // Simulate buildah on vfs (overlay couldn't initialize). The build should
    // still succeed; verification only warns unless VERCEL_VCR_STRICT_STORAGE.
    await expect(
      runDockerfileBuild({
        buildImageEnv: 'al2023',
        storeInfo: {
          GraphRoot: '/vercel/.containers/storage',
          RunRoot: '/run/containers/storage',
          GraphDriverName: 'vfs',
          GraphStatus: { 'Backing Filesystem': 'xfs' },
        },
      })
    ).resolves.toBeDefined();
  });

  it('storage verification fails the build under VERCEL_VCR_STRICT_STORAGE', async () => {
    process.env.VERCEL_VCR_STRICT_STORAGE = '1';
    try {
      await expect(
        runDockerfileBuild({
          buildImageEnv: 'al2023',
          storeInfo: {
            GraphRoot: '/vercel/.containers/storage',
            RunRoot: '/run/containers/storage',
            GraphDriverName: 'vfs',
            GraphStatus: { 'Backing Filesystem': 'xfs' },
          },
        })
      ).rejects.toThrow(/storage driver is "vfs", expected "overlay"/);
    } finally {
      delete process.env.VERCEL_VCR_STRICT_STORAGE;
    }
  });

  it('ensures the VCR repository exists before pushing', async () => {
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken({
      project_id: 'prj_test123',
    });
    existsSyncMock.mockReturnValue(true);
    const digest = `sha256:${'c'.repeat(64)}`;
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('push')) {
        return fakeChild(`latest: digest: ${digest} size: 1234\n`);
      }
      return fakeChild('');
    });

    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock, { repositoryStatus: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await build({
      ...createBuildOptions({ runtime: 'container' }),
      service: { name: 'api' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.vercel.com/v1/vcr/repository?teamId=team_test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'api', projectId: 'prj_test123' }),
      })
    );
  });

  it('treats a 409 from repository creation as already-exists', async () => {
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken({
      project_id: 'prj_test123',
    });
    existsSyncMock.mockReturnValue(true);
    const digest = `sha256:${'d'.repeat(64)}`;
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('push')) {
        return fakeChild(`latest: digest: ${digest} size: 1234\n`);
      }
      return fakeChild('');
    });

    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock, { repositoryStatus: 409 });
    vi.stubGlobal('fetch', fetchMock);

    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({ runtime: 'container' }),
        service: { name: 'api' },
      })
    );

    expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
      handler: `vcr.vercel.com/acme/my-app/api@${digest}`,
    });
  });

  it('preserves strict token parsing and tolerant claim decoding', async () => {
    const { decodeOidcClaims, parseOidcToken } = await import('../src/oidc');
    const token = fakeOidcToken();
    const claims = parseOidcToken(token);
    expect(decodeOidcClaims(token)).toEqual(claims);

    const withoutSignature = token.slice(0, token.lastIndexOf('.'));
    expect(decodeOidcClaims(withoutSignature)).toEqual(claims);
    expect(() => parseOidcToken(withoutSignature)).toThrow(
      'expected 3 dot-separated segments'
    );

    expect(decodeOidcClaims(undefined)).toEqual({});
    expect(decodeOidcClaims('header.invalid.signature')).toEqual({});
    expect(() => parseOidcToken('header.invalid.signature')).toThrow(
      'unreadable JWT payload'
    );
  });

  it('fails before registry login when the token has no owner_id', async () => {
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken({ owner_id: undefined });
    existsSyncMock.mockReturnValue(true);

    await expect(
      build({
        ...createBuildOptions({ runtime: 'container' }),
        service: { name: 'api' },
      })
    ).rejects.toThrow('missing the `owner_id` (team id) claim');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('fails the Dockerfile build when no OIDC token is available', async () => {
    existsSyncMock.mockReturnValue(true);
    spawnMock.mockImplementation(() => fakeChild(''));

    await expect(
      build({
        ...createBuildOptions({ runtime: 'container' }),
        service: { name: 'api' },
      })
    ).rejects.toThrow(/Missing VERCEL_OIDC_TOKEN/);
  });

  it('uses the existing OIDC token directly when no VERCEL_TOKEN is set', async () => {
    existsSyncMock.mockReturnValue(true);
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken({
      project_id: 'prj_test123',
    });
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('push')) {
        return fakeChild(
          `latest: digest: sha256:${'e'.repeat(64)} size: 1234\n`
        );
      }
      return fakeChild('');
    });

    await build({
      ...createBuildOptions({ runtime: 'container' }),
      service: { name: 'api' },
    });

    // An OIDC token cannot mint another OIDC token, so without a user/CLI auth
    // token (VERCEL_TOKEN) we must not call the project token-mint endpoint.
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/v1/projects/'),
      expect.anything()
    );
  });

  it('mints a fresh OIDC token when VERCEL_TOKEN is available', async () => {
    existsSyncMock.mockReturnValue(true);
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken({
      project_id: 'prj_test123',
    });
    process.env.VERCEL_TOKEN = 'cli-auth-token';
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('push')) {
        return fakeChild(
          `latest: digest: sha256:${'e'.repeat(64)} size: 1234\n`
        );
      }
      return fakeChild('');
    });

    await build({
      ...createBuildOptions({ runtime: 'container' }),
      service: { name: 'api' },
    });

    // The mint request must authenticate with the CLI auth token, not the OIDC
    // token.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/projects/prj_test123/token'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer cli-auth-token',
        }),
      })
    );
  });

  it('falls back to the existing OIDC token when minting fails', async () => {
    existsSyncMock.mockReturnValue(true);
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken({
      project_id: 'prj_test123',
    });
    process.env.VERCEL_TOKEN = 'cli-auth-token';
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock, { mintStatus: 403 });
    vi.stubGlobal('fetch', fetchMock);
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('push')) {
        return fakeChild(
          `latest: digest: sha256:${'e'.repeat(64)} size: 1234\n`
        );
      }
      return fakeChild('');
    });

    // A failed mint must not fail the build; it falls back to the existing token.
    await expect(
      build({
        ...createBuildOptions({ runtime: 'container' }),
        service: { name: 'api' },
      })
    ).resolves.toBeDefined();
  });

  it('fails before building when registry login is rejected', async () => {
    // No provisioned auth file here, so the builder performs an explicit
    // login (the docker/local path) which we simulate rejecting.
    existsSyncMock.mockImplementation((p: unknown) => {
      if (
        typeof p === 'string' &&
        basename(p) === 'auth.json' &&
        basename(dirname(p)) === 'containers'
      ) {
        return false;
      }
      return true;
    });
    process.env.VERCEL_OIDC_TOKEN = fakeOidcToken({
      owner_id: 'team_TtmJZYmD3tcLBLqWOhoVawd1',
    });
    const fetchMock = vi.fn();
    stubRegistryFetch(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('login')) {
        return fakeChildFailure(
          'Error response from daemon: login attempt to https://vcr.vercel.com/v2/ failed with status: 403 Forbidden'
        );
      }
      return fakeChild('');
    });

    await expect(
      build({
        ...createBuildOptions({ runtime: 'container' }),
        service: { name: 'api' },
      })
    ).rejects.toThrow(/vercel-enable-vcr/);

    expect(
      spawnMock.mock.calls.some(([, args]) => args.includes('build'))
    ).toBe(false);
  });

  describe('startDevServer', () => {
    function commandsRun(): string[] {
      return spawnMock.mock.calls.map(call => {
        const [cmd, args] = call as [string, string[]];
        return `${cmd} ${args.join(' ')}`;
      });
    }

    it('builds locally (host platform), runs the container, and returns the mapped port', async () => {
      existsSyncMock.mockReturnValue(true); // Dockerfile present
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return fakeRunningChild(4242);
        }
        return fakeChild('');
      });
      // `run()` (build, image inspect, port) uses the same spawn mock but reads
      // stdout; provide stdout for inspect/port via a tailored impl.
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return fakeRunningChild(4242);
        }
        if (cmd === 'docker' && args.includes('inspect')) {
          return fakeChild('{"3000/tcp":{}}');
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:54321\n');
        }
        return fakeChild('');
      });

      // Host/shell-only vars must not leak into the Linux container (e.g. macOS
      // TMPDIR breaks apps that write to the OS temp dir). These arrive via the
      // orchestrator's `meta.env` (which folds in the host `process.env`).
      const result = await startDevServer({
        ...createBuildOptions({ runtime: 'container' }),
        entrypoint: 'apps/svc/Dockerfile',
        service: { name: 'api' },
        meta: {
          isDev: true,
          env: {
            FOO: 'bar',
            TMPDIR: '/var/folders/qb/host-only/T',
            HOME: '/Users/dev',
            RUNTIME_CACHE_ENDPOINT: 'http://127.0.0.1:4783/v1/suspense-cache/',
            RUNTIME_CACHE_HEADERS: '{"authorization":"Bearer vc-dev-token"}',
            VERCEL_QUEUE_BASE_URL: 'http://127.0.0.1:4782',
            VERCEL_QUEUE_TOKEN: 'vc-dev-token',
          },
          devResourceEndpoints: {
            queues: {
              direct: 'http://127.0.0.1:4782',
              proxy: 'http://localhost:3000/_svc/_queues/test-proxy-token',
            },
            runtimeCache: {
              direct: 'http://127.0.0.1:4783/v1/suspense-cache/',
              proxy:
                'http://localhost:3000/_svc/_cache/test-proxy-token/v1/suspense-cache/',
            },
          },
        },
      } as any);

      expect(result).toMatchObject({ port: 54321, pid: 4242 });
      const commands = commandsRun();
      // Build for host platform — must NOT pin linux/amd64.
      expect(
        commands.some(
          c => c.startsWith('docker build') && !c.includes('--platform')
        )
      ).toBe(true);
      // Runs the container, publishing the EXPOSE'd port via an --env-file.
      expect(
        commands.some(
          c => c.includes('docker run') && c.includes('-p 127.0.0.1:0:3000')
        )
      ).toBe(true);
      // Env is passed via --env-file (like other builders' cloneEnv): contains
      // PORT and the orchestrator's meta.env.
      const runArgs = spawnMock.mock.calls.find(
        ([cmd, args]) => cmd === 'docker' && (args as string[])[0] === 'run'
      )?.[1] as string[];
      const envFileIdx = runArgs.indexOf('--env-file');
      expect(envFileIdx).toBeGreaterThanOrEqual(0);
      const envFileContents = readFileSync(runArgs[envFileIdx + 1], 'utf8');
      const envKeys = envFileContents
        .split('\n')
        .map(line => line.split('=')[0]);
      expect(envKeys).toContain('PORT');
      expect(envKeys).toContain('FOO');
      expect(envFileContents).toContain(
        'RUNTIME_CACHE_ENDPOINT=http://host.docker.internal:3000/_svc/_cache/test-proxy-token/v1/suspense-cache/'
      );
      expect(envFileContents).toContain(
        'VERCEL_QUEUE_BASE_URL=http://host.docker.internal:3000/_svc/_queues/test-proxy-token'
      );
      expect(envFileContents).toContain(
        'RUNTIME_CACHE_HEADERS={"authorization":"Bearer vc-dev-token"}'
      );
      expect(envFileContents).toContain('VERCEL_QUEUE_TOKEN=vc-dev-token');
      expect(runArgs).toContain('--add-host');
      expect(runArgs).toContain('host.docker.internal:host-gateway');
      // Host/shell-only vars are filtered out (from process.env and meta.env).
      expect(envKeys).not.toContain('TMPDIR');
      expect(envKeys).not.toContain('HOME');
      await result!.shutdown!();
    });

    it('reuses a running container across requests instead of rebuilding', async () => {
      // The dev server calls `startDevServer` per request. A container is a
      // persistent server, so the second call must hand back the same running
      // container — no second `docker build`/`docker run`.
      existsSyncMock.mockReturnValue(true); // Dockerfile present
      const child = fakeRunningChild(4242);
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return child;
        }
        if (cmd === 'docker' && args.includes('inspect')) {
          return fakeChild('{"3000/tcp":{}}');
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:54321\n');
        }
        return fakeChild('');
      });

      const opts = {
        ...createBuildOptions({ runtime: 'container' }),
        entrypoint: 'apps/svc/Dockerfile',
        service: { name: 'api' },
        meta: { isDev: true },
      } as any;

      const first = await startDevServer(opts);
      const second = await startDevServer(opts);

      // Same persistent server handed back both times.
      expect(first).toMatchObject({ port: 54321, persistent: true });
      expect(second).toMatchObject({ port: 54321 });
      expect(second!.pid).toBe(first!.pid);

      // Built and ran exactly once across the two requests.
      const buildCount = spawnMock.mock.calls.filter(
        ([cmd, args]) => cmd === 'docker' && (args as string[])[0] === 'build'
      ).length;
      const runCount = spawnMock.mock.calls.filter(
        ([cmd, args]) => cmd === 'docker' && (args as string[])[0] === 'run'
      ).length;
      expect(buildCount).toBe(1);
      expect(runCount).toBe(1);

      await first!.shutdown!();
    });

    it('coalesces concurrent cold starts into a single container', async () => {
      // Two requests can arrive before the first container is up. Without
      // in-flight dedup each would `docker run` its own container and all but
      // the last would be orphaned (never stopped). Both calls must share one
      // start and resolve to the same container.
      existsSyncMock.mockReturnValue(true); // Dockerfile present
      const child = fakeRunningChild(4242);
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return child;
        }
        if (cmd === 'docker' && args.includes('inspect')) {
          return fakeChild('{"3000/tcp":{}}');
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:54321\n');
        }
        return fakeChild('');
      });

      const opts = {
        ...createBuildOptions({ runtime: 'container' }),
        entrypoint: 'apps/svc/Dockerfile',
        service: { name: 'api' },
        meta: { isDev: true },
      } as any;

      // Fire both before awaiting either, so the second call sees an in-flight
      // start rather than a completed one.
      const [first, second] = await Promise.all([
        startDevServer(opts),
        startDevServer(opts),
      ]);

      expect(first!.pid).toBe(second!.pid);
      const runCount = spawnMock.mock.calls.filter(
        ([cmd, args]) => cmd === 'docker' && (args as string[])[0] === 'run'
      ).length;
      expect(runCount).toBe(1);

      await first!.shutdown!();
    });

    it('discovers a `Containerfile.vercel` marker when the entrypoint is `<detect>`', async () => {
      // The `container` framework preset resolves its entrypoint to `<detect>`.
      // In dev the builder must discover the `.vercel` opt-in marker in the
      // work dir (matching the build path), not fall back to a bare
      // `Dockerfile` that doesn't exist.
      existsSyncMock.mockImplementation((p: unknown) =>
        typeof p === 'string' ? p.endsWith('Containerfile.vercel') : false
      );
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return fakeRunningChild(4242);
        }
        if (cmd === 'docker' && args.includes('inspect')) {
          return fakeChild('{"3000/tcp":{}}');
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:54321\n');
        }
        return fakeChild('');
      });

      const result = await startDevServer({
        ...createBuildOptions({ framework: 'container' }),
        entrypoint: '<detect>',
        meta: { isDev: true },
      } as any);

      expect(result).toMatchObject({ port: 54321 });
      // The local build must target the discovered marker via `-f`.
      expect(
        commandsRun().some(
          c =>
            c.startsWith('docker build') &&
            /-f \S*Containerfile\.vercel\b/.test(c)
        )
      ).toBe(true);
    });

    it('uses a prebuilt image without building', async () => {
      existsSyncMock.mockReturnValue(false); // no Dockerfile
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return fakeRunningChild(99);
        }
        if (cmd === 'docker' && args.includes('inspect')) {
          return fakeChild('null'); // no EXPOSE
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:7777\n');
        }
        return fakeChild('');
      });

      const result = await startDevServer({
        ...createBuildOptions({}),
        entrypoint: 'grycap/cowsay:latest',
        service: { name: 'api' },
        meta: { isDev: true },
      } as any);

      expect(result).toMatchObject({ port: 7777, pid: 99 });
      const commands = commandsRun();
      expect(commands.some(c => c.startsWith('docker build'))).toBe(false);
      // Falls back to default container port 3000 when no EXPOSE.
      expect(commands.some(c => c.includes('-p 127.0.0.1:0:3000'))).toBe(true);
      expect(
        commands.some(c => c.includes('docker run') && c.includes('cowsay'))
      ).toBe(true);
    });

    it('publishes on the orchestrator-provided host port (meta.port)', async () => {
      existsSyncMock.mockReturnValue(false); // no Dockerfile
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return fakeRunningChild(101);
        }
        if (cmd === 'docker' && args.includes('inspect')) {
          return fakeChild('{"3000/tcp":{}}');
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:49222\n');
        }
        return fakeChild('');
      });

      const result = await startDevServer({
        ...createBuildOptions({}),
        entrypoint: 'grycap/cowsay:latest',
        service: { name: 'api' },
        // The orchestrator pre-allocates a host port and passes it as
        // `meta.port`; service bindings target it, so the container must be
        // published on exactly this port (not a Docker-chosen ephemeral one).
        meta: { isDev: true, port: 49222 },
      } as any);

      expect(result).toMatchObject({ port: 49222, pid: 101 });
      const commands = commandsRun();
      expect(
        commands.some(
          c => c.includes('docker run') && c.includes('-p 127.0.0.1:49222:3000')
        )
      ).toBe(true);
      // Must NOT fall back to an ephemeral (`:0:`) host port.
      expect(commands.some(c => c.includes('-p 127.0.0.1:0:'))).toBe(false);
    });

    it('cleans up the temp env-file and stops the container when it exits before becoming ready', async () => {
      existsSyncMock.mockReturnValue(false); // prebuilt image, no Dockerfile
      // `docker run` returns a child that has already exited (exitCode set), so
      // the readiness poll bails immediately via the early-exit branch.
      const exited = fakeRunningChild(123);
      exited.exitCode = 1;
      let envFilePath: string | undefined;
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          const idx = args.indexOf('--env-file');
          if (idx >= 0) {
            envFilePath = args[idx + 1];
          }
          return exited;
        }
        return fakeChild('');
      });

      await expect(
        startDevServer({
          ...createBuildOptions({}),
          entrypoint: 'grycap/cowsay:latest',
          service: { name: 'api' },
          meta: { isDev: true, env: { SECRET: 'do-not-leak' } },
        } as any)
      ).rejects.toThrow(/exited \(code 1\) before becoming ready/);

      // The temp env-file (which held the merged env, incl. secrets) is
      // removed. `existsSync` is mocked here, so probe the real FS via
      // `statSync` (unmocked) — it throws ENOENT once the dir is gone.
      expect(envFilePath).toBeDefined();
      expect(() => statSync(dirname(envFilePath!))).toThrow(/ENOENT/);
      // The container is torn down on the failure path.
      expect(
        commandsRun().some(c => /^docker stop vercel-dev-api-/.test(c))
      ).toBe(true);
    });

    it('fails fast with a clear message when the Docker daemon is unreachable', async () => {
      // The very first Docker call is the daemon availability probe
      // (`docker info`). Simulate the daemon being down: it exits non-zero
      // with the classic connection error on stderr.
      existsSyncMock.mockReturnValue(true); // Dockerfile present
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'info') {
          return fakeChildFailure(
            'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'
          );
        }
        return fakeChild('');
      });

      await expect(
        startDevServer({
          ...createBuildOptions({ runtime: 'container' }),
          entrypoint: 'apps/svc/Dockerfile',
          service: { name: 'api' },
          meta: { isDev: true },
        } as any)
      ).rejects.toThrow(/Docker daemon/i);

      // It must bail at the probe — no build or run is attempted.
      const commands = commandsRun();
      expect(commands.some(c => c.startsWith('docker build'))).toBe(false);
      expect(commands.some(c => c.includes('docker run'))).toBe(false);
    });

    it('reports a daemon-down hint and the container name when run exits 125', async () => {
      // Defense in depth: even if the upfront probe passes but `docker run`
      // later exits 125 (daemon became unreachable), the error names the
      // container and points at Docker rather than printing "undefined".
      existsSyncMock.mockReturnValue(false); // prebuilt image, no Dockerfile
      const exited = fakeRunningChild(555);
      exited.exitCode = 125;
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return exited;
        }
        return fakeChild('');
      });

      await expect(
        startDevServer({
          ...createBuildOptions({}),
          entrypoint: 'grycap/cowsay:latest',
          // No service name: the previous message printed `"undefined"` here.
          meta: { isDev: true },
        } as any)
      ).rejects.toThrow(/Docker daemon is not running|is unreachable/i);

      // The teardown targets the real (defined) container name.
      expect(
        commandsRun().some(c => /^docker stop vercel-dev-service-/.test(c))
      ).toBe(true);
    });

    it('shutdown stops the container', async () => {
      existsSyncMock.mockReturnValue(false);
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'run') {
          return fakeRunningChild(1);
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:5000\n');
        }
        return fakeChild('');
      });

      const result = await startDevServer({
        ...createBuildOptions({}),
        entrypoint: 'grycap/cowsay:latest',
        service: { name: 'api' },
        meta: { isDev: true },
      } as any);

      await result!.shutdown!();
      expect(
        commandsRun().some(c => /^docker stop vercel-dev-api-/.test(c))
      ).toBe(true);
    });
  });

  describe('prepareCache', () => {
    const BUILDAH_SNAPSHOT = `.vercel/cache/buildah-store/store-${'a'.repeat(32)}.tar.zst`;
    let root: string;
    const options = () =>
      ({
        files: {},
        entrypoint: 'apps/whoami/Dockerfile',
        workPath: root,
        repoRootPath: root,
        config: {},
      }) as any;
    beforeEach(() => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      root = mkdtempSync(join(tmpdir(), 'vercel-prepare-cache-'));
      const saved = join(root, '.vercel', 'cache', 'buildpacks', 'app', 'id');
      mkdirSync(dirname(saved), { recursive: true });
      writeFileSync(saved, 'sha256:base');
      const snapshot = join(root, BUILDAH_SNAPSHOT);
      mkdirSync(dirname(snapshot), { recursive: true });
      writeFileSync(snapshot, 'previous snapshot');
    });
    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('returns only the buildpack cache, inside the repository root', async () => {
      // A file outside the root (e.g. the Buildah store) drops the whole cache.
      const result = await prepareCache(options());
      expect(Object.keys(result)).toEqual(['.vercel/cache/buildpacks/app/id']);
      for (const file of Object.values(result)) {
        expect(relative(root, (file as FileFsRef).fsPath)).not.toMatch(/^\.\./);
      }
    });

    it('removes a Buildah store snapshot that nothing will restore', async () => {
      await prepareCache(options());
      expect(readdirSync(join(root, '.vercel', 'cache'))).toEqual([
        'buildpacks',
      ]);
    });

    it('adds the saved Buildah store snapshot when the cache is enabled', async () => {
      process.env.VERCEL_BUILDAH_STORE_CACHE = '1';
      process.env.VERCEL_DEPLOYMENT_ID = 'dpl_prepare_cache';
      const snapshot = new FileFsRef({ fsPath: join(root, BUILDAH_SNAPSHOT) });
      const save = vi
        .spyOn(BuildahStoreCache.prototype, 'save')
        .mockResolvedValue({ [BUILDAH_SNAPSHOT]: snapshot });
      try {
        const result = await prepareCache(options());
        expect(save).toHaveBeenCalledOnce();
        expect(Object.keys(result).sort()).toEqual([
          BUILDAH_SNAPSHOT,
          '.vercel/cache/buildpacks/app/id',
        ]);
      } finally {
        save.mockRestore();
      }
    });
  });

  describe('buildpacks', () => {
    let ruby: import('../src/buildpacks/registry').BuildpackRuntime;
    let go: import('../src/buildpacks/registry').BuildpackRuntime;
    let rust: import('../src/buildpacks/registry').BuildpackRuntime;
    let requestedBuildpack: typeof import('../src/buildpacks/registry').requestedBuildpack;
    let resolveImageSource: typeof import('../src/image-source').resolveImageSource;

    beforeAll(async () => {
      const registry = await import('../src/buildpacks/registry');
      ruby = registry.BUILDPACKS.find(bp => bp.runtime === 'ruby')!;
      go = registry.BUILDPACKS.find(bp => bp.runtime === 'go')!;
      rust = registry.BUILDPACKS.find(bp => bp.runtime === 'rust')!;
      requestedBuildpack = registry.requestedBuildpack;
      resolveImageSource = (await import('../src/image-source'))
        .resolveImageSource;
    });

    it('pins lifecycle and buildpack archive checksums', async () => {
      const {
        BUILDPACK_DIST_BASE_URL,
        LIFECYCLE,
        LIFECYCLE_VERSION,
        vercelBuildpackArtifact,
      } = await import('../src/buildpacks/distribution');
      const { BUILDPACKS } = await import('../src/buildpacks/registry');
      // The lifecycle is shared by every buildpack and mirrored from upstream
      // under a version-derived path.
      expect(LIFECYCLE.url.startsWith(`${BUILDPACK_DIST_BASE_URL}/`)).toBe(
        true
      );
      const lifecyclePath = LIFECYCLE.url.match(
        /\/lifecycle\/(\d+\.\d+\.\d+)\/lifecycle-v(\d+\.\d+\.\d+)-linux-x86-64\.tgz$/
      );
      expect(lifecyclePath?.[1]).toBe(LIFECYCLE_VERSION);
      expect(lifecyclePath?.[2]).toBe(LIFECYCLE_VERSION);
      expect(LIFECYCLE.sha256).toMatch(/^[0-9a-f]{64}$/);
      // Each runtime runs exactly its own Vercel buildpack, and the artifacts
      // follow the vercel/buildpacks release layout.
      expect(BUILDPACKS.map(bp => bp.runtime)).toEqual(['ruby', 'go', 'rust']);
      expect(ruby.buildpacks.map(entry => entry.id)).toEqual(['vercel/ruby']);
      expect(go.buildpacks.map(entry => entry.id)).toEqual(['vercel/go']);
      expect(rust.buildpacks.map(entry => entry.id)).toEqual(['vercel/rust']);
      for (const entry of BUILDPACKS.flatMap(bp => bp.buildpacks)) {
        const artifact = vercelBuildpackArtifact(entry);
        expect(artifact.url).toBe(
          `${BUILDPACK_DIST_BASE_URL}/buildpacks/${entry.name}/${entry.version}/vercel-${entry.name}-${entry.version}.cnb`
        );
        expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('references every pin in distribution.json from a runtime', async () => {
      const { BUILDPACKS } = await import('../src/buildpacks/registry');
      const { distribution } = await import('../src/buildpacks/distribution');
      expect(distribution).not.toHaveProperty('images');
      // A pin nothing selects is either a typo or a forgotten runtime.
      const pinnedBuildpacks = Object.keys(distribution.buildpacks).sort();
      const usedBuildpacks = [
        ...new Set(
          BUILDPACKS.flatMap(bp => bp.buildpacks.map(entry => entry.name))
        ),
      ].sort();
      expect(usedBuildpacks).toEqual(pinnedBuildpacks);

      for (const bp of BUILDPACKS) {
        for (const entry of bp.buildpacks) {
          expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
        }
      }
    });

    describe('pre-release buildpacks', () => {
      const root = 'https://store.example/pr/12';
      const artifact = 'vercel-ruby-9.9.9.cnb';
      const archiveUrl = `${root}/buildpacks/ruby/9.9.9/${artifact}`;
      const checksumUrl = `${archiveUrl}.sha256`;
      const sha256 = 'a'.repeat(64);

      const stubChecksumFetch = (
        body = `${sha256}  ${artifact}\n`,
        status = 200
      ) => {
        const fetchMock = vi.fn(async () => new Response(body, { status }));
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
      };

      it('reads a direct archive URL from VERCEL_BUILDPACK_PRERELEASE_URL', async () => {
        const { getPrereleaseUrl } = await import(
          '../src/buildpacks/distribution'
        );
        expect(getPrereleaseUrl({})).toBeUndefined();
        expect(
          getPrereleaseUrl({ VERCEL_BUILDPACK_PRERELEASE_URL: '  ' })
        ).toBeUndefined();
        expect(
          getPrereleaseUrl({
            VERCEL_BUILDPACK_PRERELEASE_URL: ` ${archiveUrl} `,
          })
        ).toBe(archiveUrl);
        // Signed blob URLs carry credentials in the query string.
        expect(
          getPrereleaseUrl({
            VERCEL_BUILDPACK_PRERELEASE_URL: `${archiveUrl}?sig=abc`,
          })
        ).toBe(`${archiveUrl}?sig=abc`);
        for (const value of [
          root,
          `${archiveUrl}/`,
          archiveUrl.replace('https:', 'http:'),
          `${root}/vercel-ruby-9.9.cnb`,
          `${root}/vercel-ruby-9.9.9.tgz`,
          'pr/12',
        ]) {
          expect(() =>
            getPrereleaseUrl({ VERCEL_BUILDPACK_PRERELEASE_URL: value })
          ).toThrow('VERCEL_BUILDPACK_PRERELEASE_URL');
        }
      });

      it('lets an entry name its own archive URL', async () => {
        const { vercelBuildpackArtifact, BUILDPACK_DIST_BASE_URL } =
          await import('../src/buildpacks/distribution');
        const [pinned] = ruby.buildpacks;
        expect(vercelBuildpackArtifact(pinned).url).toBe(
          `${BUILDPACK_DIST_BASE_URL}/buildpacks/ruby/${pinned.version}/vercel-ruby-${pinned.version}.cnb`
        );
        expect(vercelBuildpackArtifact({ ...pinned, url: archiveUrl })).toEqual(
          { url: archiveUrl, sha256: pinned.sha256 }
        );
      });

      it('replaces only the selected buildpack using its checksum file', async () => {
        const { withPrereleaseBuildpack } = await import(
          '../src/buildpacks/distribution'
        );
        const fetchMock = stubChecksumFetch();
        const other = {
          name: 'go',
          id: 'vercel/go',
          version: '1.0.0',
          sha256: 'b'.repeat(64),
        };
        const runtime = { ...ruby, buildpacks: [...ruby.buildpacks, other] };
        const resolved = await withPrereleaseBuildpack(runtime, archiveUrl);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(checksumUrl);
        expect(resolved.runtime).toBe('ruby');
        expect(resolved.resolveImage).toBe(ruby.resolveImage);
        expect(resolved.buildpacks).toEqual([
          {
            name: 'ruby',
            id: 'vercel/ruby',
            version: '9.9.9',
            sha256,
            url: archiveUrl,
          },
          other,
        ]);
        expect(resolved.buildpacks[1]).toBe(other);
        expect(ruby.buildpacks[0].version).not.toBe('9.9.9');
        expect(ruby.buildpacks[0].url).toBeUndefined();
      });

      it('rejects archives for a different runtime before fetching', async () => {
        const { withPrereleaseBuildpack } = await import(
          '../src/buildpacks/distribution'
        );
        const fetchMock = stubChecksumFetch();
        await expect(
          withPrereleaseBuildpack(ruby, `${root}/vercel-go-1.0.0.cnb`)
        ).rejects.toThrow('does not match a buildpack in the ruby runtime');
        // Another registered runtime's archive is just as wrong.
        await expect(
          withPrereleaseBuildpack(ruby, `${root}/vercel-rust-0.1.0.cnb`)
        ).rejects.toThrow('does not match a buildpack in the ruby runtime');
        await expect(withPrereleaseBuildpack(rust, archiveUrl)).rejects.toThrow(
          'does not match a buildpack in the rust runtime'
        );
        await expect(withPrereleaseBuildpack(go, archiveUrl)).rejects.toThrow(
          'does not match a buildpack in the go runtime'
        );
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it('replaces the Rust buildpack with a pre-release archive', async () => {
        const { withPrereleaseBuildpack } = await import(
          '../src/buildpacks/distribution'
        );
        const rustArtifact = 'vercel-rust-0.2.0.cnb';
        const rustArchiveUrl = `${root}/buildpacks/rust/0.2.0/${rustArtifact}`;
        stubChecksumFetch(`${sha256}  ${rustArtifact}`);
        const resolved = await withPrereleaseBuildpack(rust, rustArchiveUrl);
        expect(resolved.runtime).toBe('rust');
        expect(resolved.buildpacks).toEqual([
          {
            name: 'rust',
            id: 'vercel/rust',
            version: '0.2.0',
            sha256,
            url: rustArchiveUrl,
          },
        ]);
        expect(rust.buildpacks[0].url).toBeUndefined();
      });

      it('replaces the Go buildpack with a pre-release archive', async () => {
        const { withPrereleaseBuildpack } = await import(
          '../src/buildpacks/distribution'
        );
        const goArtifact = 'vercel-go-0.2.0.cnb';
        const goArchiveUrl = `${root}/buildpacks/go/0.2.0/${goArtifact}`;
        stubChecksumFetch(`${sha256}  ${goArtifact}`);
        const resolved = await withPrereleaseBuildpack(go, goArchiveUrl);
        expect(resolved.runtime).toBe('go');
        expect(resolved.resolveImage).toBe(go.resolveImage);
        expect(resolved.buildpacks).toEqual([
          {
            name: 'go',
            id: 'vercel/go',
            version: '0.2.0',
            sha256,
            url: goArchiveUrl,
          },
        ]);
        expect(go.buildpacks[0].url).toBeUndefined();
      });

      it.each([
        404, 503,
      ])('fails when the checksum returns HTTP %s', async status => {
        const { withPrereleaseBuildpack } = await import(
          '../src/buildpacks/distribution'
        );
        stubChecksumFetch('', status);
        const error: Error = await withPrereleaseBuildpack(
          ruby,
          archiveUrl
        ).catch(e => e);
        expect(error.message).toContain(
          `Failed to fetch pre-release checksum for ${artifact}: HTTP ${status}`
        );
        expect(error.message).not.toContain(root);
      });

      it.each([
        ['missing filename', sha256],
        ['wrong filename', `${sha256}  vercel-go-9.9.9.cnb`],
        ['short checksum', `abc  ${artifact}`],
        ['invalid checksum', `${'z'.repeat(64)}  ${artifact}`],
        ['multiple entries', `${sha256}  ${artifact}\n${sha256}  ${artifact}`],
      ])('rejects a checksum with %s', async (_name, body) => {
        const { withPrereleaseBuildpack } = await import(
          '../src/buildpacks/distribution'
        );
        stubChecksumFetch(body);
        await expect(withPrereleaseBuildpack(ruby, archiveUrl)).rejects.toThrow(
          'Invalid pre-release checksum'
        );
      });

      it('fetches and verifies the selected archive at its own version', async () => {
        const { withPrereleaseBuildpack } = await import(
          '../src/buildpacks/distribution'
        );
        const { fetchDistribution } = await import(
          '../src/buildpacks/lifecycle/lifecycle'
        );
        const { LIFECYCLE } = await import('../src/buildpacks/distribution');
        const entry = { ...ruby.buildpacks[0], version: '9.9.9' };
        const lifecycle = await lifecycleArchiveBytes();
        const buildpackage = await buildpackageBytes(entry);
        const original = LIFECYCLE.sha256;
        LIFECYCLE.sha256 = sha256Hex(lifecycle);
        const fetchMock = vi.fn();
        stubRegistryFetch(fetchMock, {
          archiveContents: new Map([
            [LIFECYCLE.url, lifecycle],
            [archiveUrl, buildpackage],
          ]),
        });
        const inner = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation((url: string | URL, init?: unknown) =>
          String(url) === checksumUrl
            ? Promise.resolve(
                new Response(`${sha256Hex(buildpackage)}  ${artifact}\n`)
              )
            : inner(url, init)
        );
        vi.stubGlobal('fetch', fetchMock);
        const cnbDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-prerelease-'));
        try {
          const resolved = await withPrereleaseBuildpack(ruby, archiveUrl);
          await fetchDistribution(resolved, cnbDir);
          for (const file of buildpackFiles(entry)) {
            expect(statSync(join(cnbDir, file)).isFile()).toBe(true);
          }
          const fetched = fetchMock.mock.calls.map(([url]) => String(url));
          expect(fetched).toContain(checksumUrl);
          expect(fetched).toContain(archiveUrl);
          expect(fetched.some(url => url.includes('latest.json'))).toBe(false);
          expect(
            fetched.some(
              url => url.includes('/buildpacks/ruby/') && !url.startsWith(root)
            )
          ).toBe(false);
        } finally {
          LIFECYCLE.sha256 = original;
          rmSync(cnbDir, { recursive: true, force: true });
        }
      });
    });

    it('selects Ruby versions from a version file, then the Gemfile, then the default', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        try {
          statSync(path);
          return true;
        } catch {
          return false;
        }
      });
      const workPath = mkdtempSync(join(tmpdir(), 'vercel-ruby-version-'));
      try {
        writeFileSync(join(workPath, 'Gemfile'), 'ruby "3.3.8"\n');
        expect(await ruby.resolveImage(workPath)).toMatchObject({
          version: '3.3.8',
        });

        // A version file wins over the Gemfile, which is then not parsed at all.
        writeFileSync(join(workPath, 'Gemfile'), 'ruby ">= 2.7"\n');
        writeFileSync(join(workPath, '.ruby-version'), '3.4.7\n');
        const selected = await ruby.resolveImage(workPath);
        expect(selected.version).toBe('3.4.7');
        expect(selected.buildImage).toBe('docker.io/library/ruby:3.4.7');
        expect(selected.buildImage).toBe(selected.runImage);

        writeFileSync(join(workPath, '.ruby-version'), '2.7.8\n');
        expect((await ruby.resolveImage(workPath)).version).toBe('2.7.8');

        rmSync(join(workPath, '.ruby-version'));
        writeFileSync(join(workPath, '.tool-versions'), 'ruby 3.3.9\n');
        expect((await ruby.resolveImage(workPath)).version).toBe('3.3.9');
      } finally {
        rmSync(workPath, { recursive: true, force: true });
      }

      const defaultPath = mkdtempSync(join(tmpdir(), 'vercel-ruby-default-'));
      try {
        writeFileSync(
          join(defaultPath, 'Gemfile'),
          'source "https://rubygems.org"\n'
        );
        expect((await ruby.resolveImage(defaultPath)).version).toBe('3.4');
      } finally {
        rmSync(defaultPath, { recursive: true, force: true });
      }
    });

    it('selects a build-container Node.js installation for Ruby projects with package.json', async () => {
      const { resolveNodeToolchain } = await import(
        '../src/buildpacks/node-toolchain'
      );
      const workPath = mkdtempSync(join(tmpdir(), 'vercel-ruby-node-'));
      let npmAvailable = true;
      existsSyncMock.mockImplementation((p: unknown) => {
        const candidate = toPosixPath(p);
        if (candidate === '/node22/bin/node') {
          return true;
        }
        if (candidate === '/node22/bin/npm') {
          return npmAvailable;
        }
        try {
          statSync(p as string);
          return true;
        } catch {
          return false;
        }
      });

      try {
        await expect(
          resolveNodeToolchain(workPath, {}, {})
        ).resolves.toBeUndefined();

        writeFileSync(
          join(workPath, 'package.json'),
          JSON.stringify({ engines: { node: '22.x' } })
        );
        await expect(resolveNodeToolchain(workPath, {}, {})).resolves.toEqual({
          home: '/node22',
          version: '22.x',
          major: 22,
        });

        npmAvailable = false;
        await expect(resolveNodeToolchain(workPath, {}, {})).rejects.toThrow(
          /missing \/node22\/bin\/npm/
        );
        npmAvailable = true;

        writeFileSync(
          join(workPath, 'package.json'),
          JSON.stringify({ engines: { bun: '1.x' } })
        );
        await expect(resolveNodeToolchain(workPath, {}, {})).rejects.toThrow(
          /Bun is not supported/
        );
      } finally {
        rmSync(workPath, { recursive: true, force: true });
      }
    });

    it('selects a buildpack only from config.buildpack', () => {
      expect(requestedBuildpack({ buildpack: 'ruby' })).toBe(ruby);
      expect(requestedBuildpack({ buildpack: 'go' })).toBe(go);
      expect(requestedBuildpack({ buildpack: 'rust' })).toBe(rust);
      expect(requestedBuildpack({ runtime: 'container' })).toBeUndefined();
      // `buildpack` is set by fs-detectors from the framework or runtime; the
      // slug itself selects nothing here, and there is no framework-level
      // preset: the buildpack classifies the application itself.
      expect(requestedBuildpack({ framework: 'ruby' })).toBeUndefined();
      expect(requestedBuildpack({ framework: 'rails' })).toBeUndefined();
      expect(requestedBuildpack({ framework: 'rust' })).toBeUndefined();
      expect(requestedBuildpack({ framework: 'axum' })).toBeUndefined();
      expect(requestedBuildpack({ framework: 'go' })).toBeUndefined();
      expect(requestedBuildpack({ runtime: 'go' })).toBeUndefined();
    });

    it('honors Dockerfile.vercel precedence without treating Dockerfile as an opt-out', () => {
      const options = (
        config: Record<string, unknown>,
        entrypoint = '<detect>'
      ) => ({
        config,
        workPath: '/',
        entrypoint,
      });

      mockMarkers('/Gemfile', '/Dockerfile');
      expect(
        resolveImageSource(
          options({ buildpack: 'ruby', framework: 'ruby' }),
          'build'
        )
      ).toMatchObject({ kind: 'buildpack', buildpack: { runtime: 'ruby' } });

      // The framework slug fs-detectors detected rides along in config but
      // plays no part in selection.
      expect(
        resolveImageSource(options({ buildpack: 'ruby' }), 'build')
      ).toMatchObject({ kind: 'buildpack', buildpack: { runtime: 'ruby' } });

      mockMarkers('/Gemfile', '/Dockerfile.vercel');
      expect(
        resolveImageSource(
          options({ buildpack: 'ruby', framework: 'ruby' }),
          'build'
        )
      ).toMatchObject({
        kind: 'dockerfile',
        dockerfileRel: 'Dockerfile.vercel',
      });

      mockMarkers('/README.md');
      expect(
        resolveImageSource(
          options({ buildpack: 'ruby', framework: 'ruby' }),
          'build'
        )
      ).toMatchObject({ kind: 'buildpack' });
    });

    it('builds an explicit buildpack entrypoint even next to a Dockerfile.vercel', () => {
      mockMarkers('/go.mod', '/Dockerfile.vercel', '/Containerfile.vercel');
      expect(
        resolveImageSource(
          {
            config: { buildpack: 'go', buildpackEntrypoint: 'cmd/worker' },
            workPath: '/',
            entrypoint: '<detect>',
          },
          'build'
        )
      ).toMatchObject({ kind: 'buildpack', buildpack: { runtime: 'go' } });
    });

    it('honors a daemon buildpack selected from the upload list despite local markers', () => {
      mockMarkers('/go.mod', '/Dockerfile.vercel', '/Containerfile.vercel');
      expect(
        resolveImageSource(
          {
            config: {
              buildpack: 'go',
              daemon: {
                name: 'worker',
                root: '.',
                entrypoint: 'main.go',
                instances: { iad1: 1 },
              },
            },
            workPath: '/',
            entrypoint: '<detect>',
          },
          'build'
        )
      ).toMatchObject({ kind: 'buildpack', buildpack: { runtime: 'go' } });
    });

    it('accepts config.buildpack only with the <detect> entrypoint', () => {
      const options = (
        config: Record<string, unknown>,
        entrypoint: string
      ) => ({
        config,
        workPath: '/',
        entrypoint,
      });
      mockMarkers('/Gemfile');

      // `buildpack` is an internal contract fs-detectors sets alongside the
      // `<detect>` sentinel. A legacy `builds` entry like `{ "src": "Gemfile",
      // "use": "@vercel/container", "config": { "buildpack": "ruby" } }`
      // passes the matched file as the entrypoint and is rejected rather than
      // becoming a second way to request a buildpack (or deploying an image
      // literally named `Gemfile`).
      expect(() =>
        resolveImageSource(options({ buildpack: 'ruby' }, 'Gemfile'), 'build')
      ).toThrow(/not a `builds` configuration option/);
      expect(
        resolveImageSource(options({ buildpack: 'ruby' }, '<detect>'), 'build')
      ).toMatchObject({ kind: 'buildpack', buildpack: { runtime: 'ruby' } });

      // A framework slug alone never selects a buildpack, so a `builds` entry
      // carrying one falls through to the ordinary entrypoint handling.
      expect(() =>
        resolveImageSource(options({ framework: 'ruby' }, '<detect>'), 'build')
      ).toThrow(/must specify an entrypoint/);

      // `config.handler` remains the explicit prebuilt-image channel even
      // when the config would otherwise select a buildpack.
      expect(
        resolveImageSource(
          options(
            { buildpack: 'ruby', handler: 'ghcr.io/acme/app:1.2' },
            '<detect>'
          ),
          'build'
        )
      ).toMatchObject({ kind: 'prebuilt', imageRef: 'ghcr.io/acme/app:1.2' });

      // Without a buildpack, an entrypoint image reference still deploys as a
      // prebuilt image.
      expect(
        resolveImageSource(options({}, 'docker.io/library/nginx:1.27'), 'build')
      ).toMatchObject({
        kind: 'prebuilt',
        imageRef: 'docker.io/library/nginx:1.27',
      });
    });

    it('does not detect a Gemfile excluded from the source map', async () => {
      const workPath = mkdtempSync(
        join(tmpdir(), 'vercel-cnb-ignored-marker-')
      );
      writeFileSync(join(workPath, 'Gemfile'), 'gem "puma"\n');
      existsSyncMock.mockImplementation((p: string) =>
        Boolean(statSync(p, { throwIfNoEntry: false }))
      );
      try {
        await expect(
          build({
            ...createBuildOptions({ buildpack: 'ruby' }),
            workPath,
            entrypoint: '<detect>',
            meta: { skipDownload: true },
          })
        ).rejects.toThrow(/no supported project marker/);
        expect(spawnMock).not.toHaveBeenCalled();
      } finally {
        rmSync(workPath, { recursive: true, force: true });
      }
    });

    it('fails a Rails buildpack build without SECRET_KEY_BASE before any build work', async () => {
      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-rails-secret-'));
      existsSyncMock.mockImplementation((p: string) =>
        Boolean(statSync(p, { throwIfNoEntry: false }))
      );
      try {
        await expect(
          build({
            ...createBuildOptions({ buildpack: 'ruby' }),
            workPath,
            entrypoint: '<detect>',
            files: {
              Gemfile: new FileBlob({
                data: 'source "https://rubygems.org"\ngem "rails", "~> 8.0"\n',
              }),
            },
            meta: { skipDownload: true },
          })
        ).rejects.toThrow(/Rails requires SECRET_KEY_BASE/);
        expect(spawnMock).not.toHaveBeenCalled();
      } finally {
        rmSync(workPath, { recursive: true, force: true });
      }
    });

    it('validates SECRET_KEY_BASE from the project build env before registry auth', async () => {
      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-rails-secret-'));
      existsSyncMock.mockImplementation((p: string) =>
        Boolean(statSync(p, { throwIfNoEntry: false }))
      );
      try {
        // With SECRET_KEY_BASE present, validation passes and the build
        // proceeds to registry auth, which needs an OIDC token.
        await expect(
          build({
            ...createBuildOptions({ buildpack: 'ruby' }),
            workPath,
            entrypoint: '<detect>',
            files: {
              Gemfile: new FileBlob({
                data: 'source "https://rubygems.org"\ngem "rails", "~> 8.0"\n',
              }),
            },
            meta: {
              skipDownload: true,
              buildEnv: { SECRET_KEY_BASE: 'synthetic-test-value' },
            },
          })
        ).rejects.toThrow(/Missing VERCEL_OIDC_TOKEN/);
      } finally {
        rmSync(workPath, { recursive: true, force: true });
      }
    });

    it('does not require SECRET_KEY_BASE for dev builds', async () => {
      // `build()` in dev returns a local tag before any buildpack work, so
      // the Rails SECRET_KEY_BASE validation never fires for `vercel dev`.
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = expectTypicalBuildResult(
        await build({
          ...createBuildOptions({ buildpack: 'ruby' }),
          entrypoint: '<detect>',
          service: { name: 'web' },
          meta: { isDev: true },
        } as any)
      );

      expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
        type: 'Lambda',
        runtime: 'container',
        handler: 'vercel-dev/web:dev',
      });
      expect(spawnMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps the staged sources until the lifecycle settles and cleans up on failure', async () => {
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock);
      vi.stubGlobal('fetch', fetchMock);
      spawnMock.mockImplementation(() => fakeChild(''));
      existsSyncMock.mockImplementation((p: string) =>
        Boolean(statSync(p, { throwIfNoEntry: false }))
      );

      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-failure-'));
      const failure = new Error('lifecycle failed');
      let staged: string | undefined;
      const lifecycle = await import('../src/buildpacks/lifecycle/docker');
      const runLifecycle = vi
        .spyOn(lifecycle, 'buildAndPushWithLifecycleDocker')
        .mockImplementation(async (_buildpack, params) => {
          staged = params.workPath;
          await Promise.resolve();
          expect(staged).not.toBe(workPath);
          expect(readFileSync(join(staged, 'Gemfile'), 'utf8')).toBe(
            'gem "puma"\n'
          );
          throw failure;
        });
      try {
        await expect(
          build({
            ...createBuildOptions({ buildpack: 'ruby' }),
            workPath,
            entrypoint: '<detect>',
            files: { Gemfile: new FileBlob({ data: 'gem "puma"\n' }) },
            meta: { skipDownload: true },
          })
        ).rejects.toBe(failure);
        expect(runLifecycle).toHaveBeenCalledOnce();
        expect(staged).toBeDefined();
        expect(statSync(staged!, { throwIfNoEntry: false })).toBeUndefined();
        expect(statSync(workPath).isDirectory()).toBe(true);
      } finally {
        runLifecycle.mockRestore();
        rmSync(workPath, { recursive: true, force: true });
      }
    });

    it('describes CNB lifecycle creator exit codes by phase', async () => {
      const { describeCreatorExitCode } = await import(
        '../src/buildpacks/lifecycle/lifecycle'
      );
      expect(describeCreatorExitCode(20)).toBe('no buildpack detected the app');
      expect(describeCreatorExitCode(21)).toMatch(/errored during detection/);
      expect(describeCreatorExitCode(51)).toMatch(
        /failed while building the app/
      );
      expect(describeCreatorExitCode(52)).toBe('the build phase failed');
      expect(describeCreatorExitCode(62)).toMatch(/export phase/);
      expect(describeCreatorExitCode(1)).toBeUndefined();
    });

    it('constructs the CNB order, platform env, and creator arguments', async () => {
      const { creatorArgs, writeOrderDir, writePlatformEnvDir } = await import(
        '../src/buildpacks/lifecycle/lifecycle'
      );
      const orderDir = writeOrderDir(ruby);
      const envDir = writePlatformEnvDir(
        {
          EMPTY: '',
          RACK_ENV: 'staging',
          VERCEL_NODE_HOME: '/project-controlled',
          VERCEL_COMMAND: '["ignored"]',
          // Must not be written as a file name.
          'BAD/NAME': 'nope',
          '../escape': 'nope',
        },
        {
          nodeHome: '/node24',
        }
      );
      try {
        const order = readFileSync(join(orderDir, 'order.toml'), 'utf8');
        expect(order).toContain('id = "vercel/ruby"');
        expect(order).not.toContain('optional = true');
        expect(readFileSync(join(envDir, 'EMPTY'), 'utf8')).toBe('');
        expect(readFileSync(join(envDir, 'RACK_ENV'), 'utf8')).toBe('staging');
        // The platform no longer dictates the framework; the buildpack reads
        // `railties` from the resolved bundle instead. Invalid names are
        // dropped rather than written outside the directory.
        expect(readdirSync(envDir).sort()).toEqual([
          'EMPTY',
          'RACK_ENV',
          'VERCEL_NODE_HOME',
        ]);
        expect(readFileSync(join(envDir, 'VERCEL_NODE_HOME'), 'utf8')).toBe(
          '/node24'
        );

        const image = {
          version: '3.4',
          buildImage: 'docker.io/library/ruby:3.4',
          runImage: 'docker.io/library/ruby:3.4',
        };
        expect(creatorArgs(image, 'vcr.vercel.com/acme/app:build')).toEqual([
          '-app=/workspace',
          '-order=/platform/order/order.toml',
          '-skip-restore',
          `-run-image=${image.runImage}`,
          '-report=/platform-output/report.toml',
          'vcr.vercel.com/acme/app:build',
        ]);
        // Parallel export needs a cache; without one the lifecycle only warns.
        expect(
          creatorArgs(image, 'vcr.vercel.com/acme/app:build', {
            parallelExport: true,
          })
        ).not.toContain('-parallel');
        expect(
          creatorArgs(image, 'vcr.vercel.com/acme/app:build', {
            cacheDir: '/cache',
            parallelExport: true,
          })
        ).toEqual(expect.arrayContaining(['-cache-dir=/cache', '-parallel']));
      } finally {
        rmSync(orderDir, { recursive: true, force: true });
        rmSync(envDir, { recursive: true, force: true });
      }
    });

    it('passes project build env through and reserves VERCEL_NODE_HOME', async () => {
      // The project's build env is written to /platform/env verbatim so the
      // buildpack sees the same variables a build command would, except for
      // unsupported command overrides and the platform-owned Node path.
      const { writePlatformEnvDir } = await import(
        '../src/buildpacks/lifecycle/lifecycle'
      );
      const envDir = writePlatformEnvDir(
        {
          RAILS_MASTER_KEY: 'secret',
          VERCEL_NODE_HOME: '/project-controlled',
        },
        {}
      );
      try {
        expect(readFileSync(join(envDir, 'RAILS_MASTER_KEY'), 'utf8')).toBe(
          'secret'
        );
        expect(readdirSync(envDir)).not.toContain('VERCEL_NODE_HOME');
      } finally {
        rmSync(envDir, { recursive: true, force: true });
      }
    });

    it('stages only the filtered source map, not the live checkout', async () => {
      const { stageWorkspace } = await import(
        '../src/buildpacks/lifecycle/lifecycle'
      );

      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-stage-src-'));
      const staged = mkdtempSync(join(tmpdir(), 'vercel-cnb-stage-dst-'));
      try {
        seedExcludedProjectDirs(workPath);
        writeFileSync(
          join(workPath, 'Gemfile'),
          'source "https://rubygems.org"\n'
        );
        mkdirSync(join(workPath, 'vendor', 'gem', '.git'), { recursive: true });
        writeFileSync(join(workPath, 'vendor', 'gem', '.git', 'HEAD'), 'x\n');
        writeFileSync(join(workPath, 'vendor', 'gem', 'lib.rb'), '');

        await stageWorkspace(
          {
            workPath,
            files: {
              Gemfile: new FileFsRef({ fsPath: join(workPath, 'Gemfile') }),
              'vendor/gem/lib.rb': new FileBlob({ data: 'source' }),
            },
          },
          staged
        );

        expect(readdirSync(staged).sort()).toEqual(['Gemfile', 'vendor']);
        expect(readdirSync(join(staged, 'vendor', 'gem')).sort()).toEqual([
          'lib.rb',
        ]);
        // The source tree is untouched.
        expect(readdirSync(workPath).sort()).toEqual([
          '.git',
          '.vercel',
          'Gemfile',
          'vendor',
        ]);
      } finally {
        rmSync(workPath, { recursive: true, force: true });
        rmSync(staged, { recursive: true, force: true });
      }
    });

    it('authenticates to the registry before running the lifecycle', async () => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      const distribution = await stageDistribution(ruby);
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock, {
        archiveContents: distribution.archiveContents,
      });
      vi.stubGlobal('fetch', fetchMock);
      // A real directory: version resolution reads the Gemfile from disk.
      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-auth-'));
      writeFileSync(
        join(workPath, 'Gemfile'),
        'source "https://rubygems.org"\n'
      );
      writeFileSync(
        join(workPath, 'package.json'),
        JSON.stringify({ engines: { node: '22.x' } })
      );
      seedExcludedProjectDirs(workPath);
      existsSyncMock.mockImplementation((p: unknown) => {
        const candidate = toPosixPath(p);
        if (
          candidate === '/node22/bin/node' ||
          candidate === '/node22/bin/npm'
        ) {
          return true;
        }
        try {
          statSync(p as string);
          return true;
        } catch {
          return false;
        }
      });

      const digest = `sha256:${'f'.repeat(64)}`;
      let platformNodeHome: string | undefined;
      let cnbLayout: string[] = [];
      let workspaceLayout: string[] | undefined;
      const expectedCnbLayout = [
        'lifecycle/creator',
        ...buildpackFiles(ruby.buildpacks[0]),
      ];
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'buildah' && args.includes('copy')) {
          // `buildah copy <container> <source> /workspace`: the source is the
          // staged copy, deleted after the build, so snapshot it now.
          const source = args[args.indexOf('/workspace') - 1];
          expect(source).not.toBe(workPath);
          workspaceLayout = readdirSync(source).sort();
          return fakeChild('');
        }
        if (cmd === 'buildah' && args.includes('info')) {
          return fakeChild(
            JSON.stringify({
              store: {
                GraphRoot: '/vercel/.containers/storage',
                RunRoot: '/run/containers/storage',
                GraphDriverName: 'overlay',
                GraphStatus: { 'Backing Filesystem': 'xfs' },
              },
            })
          );
        }
        // The creator writes its report into the mounted platform-output dir.
        if (args.some(a => a.includes('/cnb/lifecycle/creator'))) {
          const volume = args.find(a => a.endsWith(':/platform-output'));
          const platformEnvVolume = args.find(a =>
            a.endsWith(':/platform/env:ro')
          );
          const cnbVolume = args.find(a => a.endsWith(':/cnb:ro'));
          if (platformEnvVolume) {
            platformNodeHome = readFileSync(
              join(
                platformEnvVolume.slice(0, -':/platform/env:ro'.length),
                'VERCEL_NODE_HOME'
              ),
              'utf8'
            );
          }
          if (cnbVolume) {
            // The mount is deleted after the build; snapshot what the
            // lifecycle would have seen.
            const cnbDir = cnbVolume.slice(0, -':/cnb:ro'.length);
            cnbLayout = expectedCnbLayout.filter(p =>
              statSync(join(cnbDir, p), { throwIfNoEntry: false })
            );
          }
          if (volume) {
            writeFileSync(
              join(volume.slice(0, -':/platform-output'.length), 'report.toml'),
              `[image]\ndigest = "${digest}"\n`
            );
          }
          return fakeChild('');
        }
        return fakeChild('');
      });

      let result;
      try {
        result = expectTypicalBuildResult(
          await build({
            ...createBuildOptions({ buildpack: 'ruby', framework: 'ruby' }),
            entrypoint: '<detect>',
            workPath,
            files: {
              Gemfile: new FileFsRef({ fsPath: join(workPath, 'Gemfile') }),
              'package.json': new FileFsRef({
                fsPath: join(workPath, 'package.json'),
              }),
            },
            meta: { skipDownload: true },
            service: { name: 'web' },
          } as any)
        );
      } finally {
        distribution.restore();
        rmSync(workPath, { recursive: true, force: true });
      }

      expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
        handler: `vcr.vercel.com/acme/my-app/web@${digest}`,
      });

      const commands = spawnMock.mock.calls.map(call => {
        const [cmd, args] = call as [string, string[]];
        return `${cmd} ${args.join(' ')}`;
      });
      const loginIndex = commands.findIndex(c =>
        /\bbuildah\b.*\blogin\b/.test(c)
      );
      const creatorIndex = commands.findIndex(c =>
        c.includes('/cnb/lifecycle/creator')
      );
      expect(loginIndex).toBeGreaterThanOrEqual(0);
      expect(creatorIndex).toBeGreaterThanOrEqual(0);
      expect(loginIndex).toBeLessThan(creatorIndex);
      const creatorArgs = spawnMock.mock.calls[creatorIndex][1] as string[];
      expect(creatorArgs.some(arg => arg.endsWith(':/cnb:ro'))).toBe(true);
      // The lifecycle tgz and the .cnb's layers were laid out for the creator.
      expect(cnbLayout).toEqual(expectedCnbLayout);
      // What `buildah copy` put in /workspace is what the exporter publishes.
      expect(workspaceLayout).toEqual(['Gemfile', 'package.json']);
      expect(creatorArgs).toContain('/node22:/node22:ro');
      expect(platformNodeHome).toBe('/node22');
      expect(
        commands.some(
          c => c.includes('login') && c.includes('--username team_test')
        )
      ).toBe(true);
      // The report dir must be writable by the creator's non-root uid.
      expect(chownSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('vercel-cnb-report-'),
        1001,
        1001
      );
    });

    /**
     * Build a Go module with the buildah lifecycle, recording the platform env
     * the creator sees. The creator exits with `creatorExitCode` when set.
     */
    async function runGoBuildpackBuild(options: {
      config: Record<string, unknown>;
      service?: { name: string };
      creatorExitCode?: number;
      ignoredDockerfile?: boolean;
      /** The project's build env, besides `CGO_ENABLED=1`. */
      buildEnv?: Record<string, string>;
      /** Sources to leave out of the module. */
      without?: string[];
    }) {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      const distribution = await stageDistribution(go);
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock, {
        archiveContents: distribution.archiveContents,
      });
      vi.stubGlobal('fetch', fetchMock);
      // A real directory: version selection reads go.mod.
      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-go-'));
      const sources: Record<string, string> = {
        'go.mod': 'module example.com/app\n\ngo 1.26\n\ntoolchain go1.26.1\n',
        'cmd/api/main.go': 'package main\n\nfunc main() {}\n',
        'cmd/worker/main.go': 'package main\n\nfunc main() {}\n',
      };
      if (options.ignoredDockerfile) {
        delete sources['cmd/api/main.go'];
        writeFileSync(join(workPath, 'Dockerfile.vercel'), 'FROM scratch');
      }
      for (const name of options.without ?? []) delete sources[name];
      for (const [name, contents] of Object.entries(sources)) {
        mkdirSync(dirname(join(workPath, name)), { recursive: true });
        writeFileSync(join(workPath, name), contents);
      }
      existsSyncMock.mockImplementation((p: unknown) =>
        Boolean(statSync(p as string, { throwIfNoEntry: false }))
      );

      const digest = `sha256:${'a'.repeat(64)}`;
      let platformEnv: Record<string, string> | undefined;
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'buildah' && args.includes('info')) {
          return fakeChild(
            JSON.stringify({
              store: {
                GraphRoot: '/vercel/.containers/storage',
                RunRoot: '/run/containers/storage',
                GraphDriverName: 'overlay',
                GraphStatus: { 'Backing Filesystem': 'xfs' },
              },
            })
          );
        }
        if (args.some(a => a.includes('/cnb/lifecycle/creator'))) {
          const envVolume = args.find(a => a.endsWith(':/platform/env:ro'))!;
          const envDir = envVolume.slice(0, -':/platform/env:ro'.length);
          platformEnv = Object.fromEntries(
            readdirSync(envDir).map(name => [
              name,
              readFileSync(join(envDir, name), 'utf8'),
            ])
          );
          if (options.creatorExitCode !== undefined) {
            return fakeChildFailure('', options.creatorExitCode);
          }
          const volume = args.find(a => a.endsWith(':/platform-output'))!;
          writeFileSync(
            join(volume.slice(0, -':/platform-output'.length), 'report.toml'),
            `[image]\ndigest = "${digest}"\n`
          );
        }
        return fakeChild('');
      });

      try {
        const result = await build({
          ...createBuildOptions({ buildpack: 'go', ...options.config }),
          entrypoint: '<detect>',
          workPath,
          files: Object.fromEntries(
            Object.keys(sources).map(name => [
              name,
              new FileFsRef({ fsPath: join(workPath, name) }),
            ])
          ),
          meta: {
            skipDownload: true,
            buildEnv: { CGO_ENABLED: '1', ...options.buildEnv },
          },
          service: options.service,
        } as any);
        return {
          result,
          digest,
          platformEnv,
          calls: spawnMock.mock.calls as [string, string[]][],
        };
      } finally {
        distribution.restore();
        rmSync(workPath, { recursive: true, force: true });
      }
    }

    it.each([
      undefined,
      '.',
      'cmd/worker/main.go',
      'cmd/worker',
    ])('builds a Go service with entrypoint %j on its go.mod toolchain and runs it on distroless', async buildpackEntrypoint => {
      const { result, digest, platformEnv, calls } = await runGoBuildpackBuild({
        config: {
          framework: 'go',
          ...(buildpackEntrypoint ? { buildpackEntrypoint } : {}),
        },
        service: { name: 'api' },
      });
      const output = expectTypicalBuildResult(result).output;
      expect(output[CONTAINER_OUTPUT_PATH]).toMatchObject({
        handler: `vcr.vercel.com/acme/my-app/api@${digest}`,
        runtime: 'container',
      });
      // The creator never runs a command override for a buildpack build.
      expect(output[CONTAINER_OUTPUT_PATH]).not.toHaveProperty('command');
      const from = calls.find(
        ([cmd, args]) => cmd === 'buildah' && args.includes('from')
      );
      expect(from?.[1].at(-1)).toBe('docker.io/library/golang:1.26.1-bookworm');
      const creator = calls.find(([, args]) =>
        args.includes('/cnb/lifecycle/creator')
      );
      expect(creator?.[1]).toContain(
        '-run-image=gcr.io/distroless/cc-debian12'
      );
      // The project's build env reaches the buildpack alongside the
      // entrypoint, which the buildpack resolves. Without one, the service
      // builds @vercel/go's first candidate.
      expect(platformEnv).toEqual({
        CGO_ENABLED: '1',
        VERCEL_ENTRYPOINT: buildpackEntrypoint ?? 'cmd/api',
      });
    });

    it('builds the first @vercel/go candidate for a zero-config app', async () => {
      const { platformEnv } = await runGoBuildpackBuild({
        config: { framework: 'go' },
      });
      expect(platformEnv).toEqual({
        CGO_ENABLED: '1',
        VERCEL_ENTRYPOINT: 'cmd/api',
      });
    });

    it("lets a zero-config app's VERCEL_ENTRYPOINT override the candidates", async () => {
      const { platformEnv } = await runGoBuildpackBuild({
        config: { framework: 'go' },
        buildEnv: { VERCEL_ENTRYPOINT: './cmd/worker' },
      });
      expect(platformEnv).toEqual({
        CGO_ENABLED: '1',
        VERCEL_ENTRYPOINT: './cmd/worker',
      });
    });

    it("ignores a service's VERCEL_ENTRYPOINT environment variable", async () => {
      const { platformEnv } = await runGoBuildpackBuild({
        config: { framework: 'go' },
        service: { name: 'api' },
        buildEnv: { VERCEL_ENTRYPOINT: 'cmd/worker' },
      });
      expect(platformEnv).toEqual({
        CGO_ENABLED: '1',
        VERCEL_ENTRYPOINT: 'cmd/api',
      });
    });

    it('fails a zero-config app without a candidate before the lifecycle runs', async () => {
      await expect(
        runGoBuildpackBuild({
          config: { framework: 'go' },
          without: ['cmd/api/main.go'],
        })
      ).rejects.toThrow(
        "Couldn't find the Go program to build. Add main.go, cmd/api/main.go, or cmd/server/main.go, or set the VERCEL_ENTRYPOINT environment variable to its package directory or a .go file in it."
      );
      expect(
        spawnMock.mock.calls.some(([, args]) =>
          (args as string[]).includes('/cnb/lifecycle/creator')
        )
      ).toBe(false);
    });

    const worker = {
      name: 'worker',
      root: 'backend',
      entrypoint: 'cmd/worker/main.go',
      command: ['worker', '--queue=emails'],
      instances: { iad1: 1 },
    };
    const workerConfig = {
      daemon: worker,
      buildpackEntrypoint: 'cmd/worker/main.go',
    };

    it('builds a Go daemon into its own repository with the command baked in', async () => {
      const { result, digest, platformEnv } = await runGoBuildpackBuild({
        config: workerConfig,
      });
      expect(platformEnv).toEqual({
        CGO_ENABLED: '1',
        VERCEL_ENTRYPOINT: 'cmd/worker/main.go',
        VERCEL_COMMAND: '["worker","--queue=emails"]',
      });
      // A descriptor command would replace the launcher, which sets up PATH.
      expect(expectTypicalBuildResult(result).daemons).toEqual({
        worker: {
          runtime: 'container',
          image: `vcr.vercel.com/acme/my-app/daemon.worker@${digest}`,
          instances: { iad1: 1 },
        },
      });
    });

    it('keeps a Go daemon on its buildpack despite an ignored Dockerfile', async () => {
      const { result, platformEnv, calls } = await runGoBuildpackBuild({
        config: workerConfig,
        ignoredDockerfile: true,
      });
      expect(
        calls.some(([, args]) => args.includes('/cnb/lifecycle/creator'))
      ).toBe(true);
      expect(platformEnv).toEqual({
        CGO_ENABLED: '1',
        VERCEL_ENTRYPOINT: 'cmd/worker/main.go',
        VERCEL_COMMAND: '["worker","--queue=emails"]',
      });
      expect(
        expectTypicalBuildResult(result).daemons?.worker
      ).not.toHaveProperty('command');
    });

    it("ignores the project's VERCEL_ENTRYPOINT for a daemon", async () => {
      const { platformEnv } = await runGoBuildpackBuild({
        config: {
          daemon: { ...worker, entrypoint: 'main.go' },
          buildpackEntrypoint: 'main.go',
        },
        buildEnv: { VERCEL_ENTRYPOINT: 'cmd/api' },
      });
      expect(platformEnv).toEqual({
        CGO_ENABLED: '1',
        VERCEL_ENTRYPOINT: 'main.go',
        VERCEL_COMMAND: '["worker","--queue=emails"]',
      });
    });

    it('names the daemon and its root when its buildpack fails', async () => {
      await expect(
        runGoBuildpackBuild({
          config: workerConfig,
          creatorExitCode: 51,
        })
      ).rejects.toThrow(
        new Error(
          'Failed to build daemon "worker" (root "backend") with the go buildpack. Its error is above.'
        )
      );
    });

    it('keeps the lifecycle error when a daemon build fails outside the buildpack', async () => {
      await expect(
        runGoBuildpackBuild({
          config: workerConfig,
          creatorExitCode: 62,
        })
      ).rejects.toThrow('go buildpack build failed via lifecycle/creator');
    });

    it('restores and republishes the CNB directory cache around the buildah lifecycle', async () => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      const distribution = await stageDistribution(ruby);
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock, {
        archiveContents: distribution.archiveContents,
      });
      vi.stubGlobal('fetch', fetchMock);
      const cacheModule = await import('../src/buildpacks/cache');
      const {
        buildpackCacheDir,
        CNB_CACHE_METADATA_FILE,
        CNB_COMMITTED_DIR,
        IMAGE_ID_FILE,
      } = cacheModule;
      const { CNB_PLATFORM_API } = await import(
        '../src/buildpacks/lifecycle/lifecycle'
      );

      // A service at apps/web with a cache saved on the same base image. Real
      // layers are `sha256:<id>.tar`, invalid on Windows.
      const repoRoot = mkdtempSync(join(tmpdir(), 'vercel-cnb-repo-'));
      const workPath = join(repoRoot, 'apps', 'web');
      mkdirSync(workPath, { recursive: true });
      writeFileSync(
        join(workPath, 'Gemfile'),
        'source "https://rubygems.org"\n'
      );
      const cacheDir = buildpackCacheDir({
        repoRootPath: repoRoot,
        workPath,
        service: { name: 'web' },
      });
      const key = basename(cacheDir);
      const baseImageId = `sha256:${'9'.repeat(64)}`;
      mkdirSync(join(cacheDir, CNB_COMMITTED_DIR), { recursive: true });
      writeFileSync(
        join(cacheDir, CNB_COMMITTED_DIR, CNB_CACHE_METADATA_FILE),
        '{"gems":"old"}'
      );
      writeFileSync(join(cacheDir, CNB_COMMITTED_DIR, 'old-gems.tar'), 'old');
      writeFileSync(join(cacheDir, IMAGE_ID_FILE), baseImageId);

      existsSyncMock.mockImplementation((p: unknown) =>
        Boolean(statSync(p as string, { throwIfNoEntry: false }))
      );
      const digest = `sha256:${'f'.repeat(64)}`;
      let hydrated: string[] | undefined;
      let creatorArgs: string[] | undefined;
      const restoreCache = vi.spyOn(cacheModule, 'restoreBuildpackCache');
      let removal: ReturnType<typeof fakeRunningChild> | undefined;
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'buildah' && args.includes('rm')) {
          // Never exits: the build must not wait for the removal.
          removal = fakeRunningChild();
          return removal;
        }
        if (cmd === 'buildah' && args.includes('from')) {
          // The pull only finishes once the saved cache was copied alongside it.
          const pull = fakeRunningChild();
          vi.waitFor(() => {
            const copiedCache = restoreCache.mock.calls[0][2];
            expect(
              readFileSync(
                join(copiedCache, CNB_COMMITTED_DIR, 'old-gems.tar'),
                'utf8'
              )
            ).toBe('old');
          }).then(
            () => pull.emit('close', 0),
            () => pull.emit('close', 1)
          );
          return pull;
        }
        if (cmd === 'buildah' && args.includes('inspect')) {
          return fakeChild(JSON.stringify({ FromImageID: baseImageId }));
        }
        if (cmd === 'buildah' && args.includes('info')) {
          return fakeChild(JSON.stringify({ store: {} }));
        }
        if (args.some(a => a.includes('/cnb/lifecycle/creator'))) {
          creatorArgs = args;
          const cacheVolume = args.find(a => a.endsWith(':/cache'))!;
          const hostCache = cacheVolume.slice(0, -':/cache'.length);
          const committed = join(hostCache, CNB_COMMITTED_DIR);
          hydrated = readdirSync(committed).sort();
          // The exporter commits a new layer and drops the old one.
          writeFileSync(
            join(committed, CNB_CACHE_METADATA_FILE),
            '{"gems":"new"}'
          );
          writeFileSync(join(committed, 'new-gems.tar'), 'new');
          rmSync(join(committed, 'old-gems.tar'));
          mkdirSync(join(hostCache, 'staging'), { recursive: true });
          const reportVolume = args.find(a => a.endsWith(':/platform-output'))!;
          writeFileSync(
            join(
              reportVolume.slice(0, -':/platform-output'.length),
              'report.toml'
            ),
            `[image]\ndigest = "${digest}"\n`
          );
          return fakeChild('');
        }
        return fakeChild('');
      });
      try {
        const result = expectTypicalBuildResult(
          await build({
            ...createBuildOptions({ buildpack: 'ruby', framework: 'ruby' }),
            entrypoint: '<detect>',
            workPath,
            repoRootPath: repoRoot,
            files: {
              Gemfile: new FileFsRef({ fsPath: join(workPath, 'Gemfile') }),
            },
            meta: { skipDownload: true },
            service: { name: 'web' },
          } as any)
        );
        expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
          handler: `vcr.vercel.com/acme/my-app/web@${digest}`,
        });
        // The creator saw the saved cache in a private, writable /cache.
        expect(hydrated).toEqual(
          [CNB_CACHE_METADATA_FILE, 'old-gems.tar'].sort()
        );
        expect(creatorArgs).toContain('-cache-dir=/cache');
        expect(creatorArgs).toContain('-parallel');
        expect(creatorArgs!.join(' ')).not.toContain('-previous-image');
        expect(creatorArgs).not.toContain('-skip-restore');
        expect(creatorArgs).toContain(`CNB_PLATFORM_API=${CNB_PLATFORM_API}`);
        expect(lchownSyncMock).toHaveBeenCalledWith(
          expect.stringContaining(CNB_CACHE_METADATA_FILE),
          1001,
          1001
        );
        // The newly committed cache replaced the saved one.
        expect(readdirSync(join(cacheDir, CNB_COMMITTED_DIR)).sort()).toEqual(
          [CNB_CACHE_METADATA_FILE, 'new-gems.tar'].sort()
        );
        expect(readFileSync(join(cacheDir, IMAGE_ID_FILE), 'utf8')).toBe(
          baseImageId
        );
        const scratch = dirname(restoreCache.mock.calls[0][2]);
        expect(existsSync(scratch)).toBe(false);
        const removalCall = spawnMock.mock.calls.find(
          ([cmd, args]) => cmd === 'buildah' && args.includes('rm')
        );
        expect(removalCall?.[2]).toMatchObject({
          detached: true,
          stdio: 'ignore',
        });
        expect(removal?.unref).toHaveBeenCalled();

        // The platform calls prepareCache once per build entry.
        const collect = () =>
          prepareCache({
            files: {},
            entrypoint: 'services/web/Gemfile',
            workPath: repoRoot,
            repoRootPath: repoRoot,
            config: {},
          } as any);
        const expected = [
          `.vercel/cache/buildpacks/${key}/committed/${CNB_CACHE_METADATA_FILE}`,
          `.vercel/cache/buildpacks/${key}/committed/new-gems.tar`,
          `.vercel/cache/buildpacks/${key}/${IMAGE_ID_FILE}`,
        ].sort();
        expect(Object.keys(await collect()).sort()).toEqual(expected);
        expect(Object.keys(await collect()).sort()).toEqual(expected);
      } finally {
        for (const [, , cacheDir] of restoreCache.mock.calls) {
          rmSync(dirname(cacheDir), { recursive: true, force: true });
        }
        restoreCache.mockRestore();
        distribution.restore();
        rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it.each([
      ['base image lookup fails', false],
      ['cache ownership fails', true],
    ])('runs without a cache directory when %s', async (_case, ownershipFails) => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      if (ownershipFails) {
        lchownSyncMock.mockImplementation(() => {
          throw new Error('cache ownership failed');
        });
      }
      const distribution = await stageDistribution(ruby);
      const cacheModule = await import('../src/buildpacks/cache');
      const restoreCache = vi.spyOn(cacheModule, 'restoreBuildpackCache');
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock, {
        archiveContents: distribution.archiveContents,
      });
      vi.stubGlobal('fetch', fetchMock);
      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-nocache-'));
      writeFileSync(
        join(workPath, 'Gemfile'),
        'source "https://rubygems.org"\n'
      );
      existsSyncMock.mockImplementation((p: unknown) =>
        Boolean(statSync(p as string, { throwIfNoEntry: false }))
      );
      let creatorArgs: string[] | undefined;
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'buildah' && args.includes('inspect')) {
          return fakeChild(
            JSON.stringify(
              ownershipFails ? { FromImageID: `sha256:${'a'.repeat(64)}` } : {}
            )
          );
        }
        if (args.some(a => a.includes('/cnb/lifecycle/creator'))) {
          creatorArgs = args;
          const reportVolume = args.find(a => a.endsWith(':/platform-output'))!;
          writeFileSync(
            join(
              reportVolume.slice(0, -':/platform-output'.length),
              'report.toml'
            ),
            `[image]\ndigest = "sha256:${'e'.repeat(64)}"\n`
          );
        }
        return fakeChild('');
      });
      try {
        await build({
          ...createBuildOptions({ buildpack: 'ruby' }),
          entrypoint: '<detect>',
          workPath,
          repoRootPath: workPath,
          files: {
            Gemfile: new FileFsRef({ fsPath: join(workPath, 'Gemfile') }),
          },
          meta: { skipDownload: true },
        } as any);
        expect(creatorArgs).toContain('-skip-restore');
        expect(creatorArgs).not.toContain('-parallel');
        expect(creatorArgs!.join(' ')).not.toContain('-previous-image');
        expect(creatorArgs!.some(a => a.endsWith(':/cache'))).toBe(false);
        expect(creatorArgs!.some(a => a.startsWith('-cache-dir='))).toBe(false);
        expect(
          spawnMock.mock.calls.some(([, args]) =>
            (args as string[]).includes('inspect')
          )
        ).toBe(true);
        expect(restoreCache).toHaveBeenCalledOnce();
        const scratch = dirname(restoreCache.mock.calls[0][2]);
        expect(existsSync(scratch)).toBe(false);
        expect(existsSync(join(workPath, '.vercel', 'cache'))).toBe(false);
      } finally {
        for (const [, , cacheDir] of restoreCache.mock.calls) {
          rmSync(dirname(cacheDir), { recursive: true, force: true });
        }
        restoreCache.mockRestore();
        distribution.restore();
        rmSync(workPath, { recursive: true, force: true });
      }
    });

    it('builds with the archive VERCEL_BUILDPACK_PRERELEASE_URL names', async () => {
      const root = 'https://store.example/pr/12';
      const { LIFECYCLE, vercelBuildpackArtifact } = await import(
        '../src/buildpacks/distribution'
      );
      const [pinned] = ruby.buildpacks;
      const entry = { ...pinned, version: '9.9.9' };
      const lifecycle = await lifecycleArchiveBytes();
      const buildpackage = await buildpackageBytes(entry);
      const archiveUrl = `${root}/buildpacks/ruby/9.9.9/vercel-ruby-9.9.9.cnb`;
      const checksumUrl = `${archiveUrl}.sha256`;
      const originalLifecycle = LIFECYCLE.sha256;
      LIFECYCLE.sha256 = sha256Hex(lifecycle);

      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      process.env.VERCEL_BUILDPACK_PRERELEASE_URL = archiveUrl;
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock, {
        archiveContents: new Map([
          [LIFECYCLE.url, lifecycle],
          [archiveUrl, buildpackage],
        ]),
      });
      const inner = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string | URL, init?: unknown) =>
        String(url) === checksumUrl
          ? Promise.resolve({
              ok: true,
              status: 200,
              statusText: 'OK',
              text: async () =>
                `${sha256Hex(buildpackage)}  vercel-ruby-9.9.9.cnb\n`,
            })
          : inner(url, init)
      );
      vi.stubGlobal('fetch', fetchMock);

      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-prerelease-'));
      writeFileSync(
        join(workPath, 'Gemfile'),
        'source "https://rubygems.org"\n'
      );
      existsSyncMock.mockImplementation((p: unknown) => {
        try {
          statSync(p as string);
          return true;
        } catch {
          return false;
        }
      });

      const digest = `sha256:${'e'.repeat(64)}`;
      let cnbLayout: string[] = [];
      let order: string | undefined;
      spawnMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args.some(a => a.includes('/cnb/lifecycle/creator'))) {
          const cnbVolume = args.find(a => a.endsWith(':/cnb:ro'));
          if (cnbVolume) {
            const cnbDir = cnbVolume.slice(0, -':/cnb:ro'.length);
            cnbLayout = [
              ...buildpackFiles(pinned),
              ...buildpackFiles(entry),
            ].filter(p => statSync(join(cnbDir, p), { throwIfNoEntry: false }));
          }
          const orderVolume = args.find(a => a.endsWith(':/platform/order:ro'));
          if (orderVolume) {
            order = readFileSync(
              join(
                orderVolume.slice(0, -':/platform/order:ro'.length),
                'order.toml'
              ),
              'utf8'
            );
          }
          const volume = args.find(a => a.endsWith(':/platform-output'));
          if (volume) {
            writeFileSync(
              join(volume.slice(0, -':/platform-output'.length), 'report.toml'),
              `[image]\ndigest = "${digest}"\n`
            );
          }
        }
        return fakeChild('');
      });

      let result;
      try {
        result = expectTypicalBuildResult(
          await build({
            ...createBuildOptions({ buildpack: 'ruby', framework: 'ruby' }),
            entrypoint: '<detect>',
            workPath,
            files: {
              Gemfile: new FileFsRef({ fsPath: join(workPath, 'Gemfile') }),
            },
            meta: { skipDownload: true },
            service: { name: 'web' },
          } as any)
        );
      } finally {
        LIFECYCLE.sha256 = originalLifecycle;
        rmSync(workPath, { recursive: true, force: true });
      }

      expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
        handler: `vcr.vercel.com/acme/my-app/web@${digest}`,
      });
      // The pre-release archive, not the pinned release, was fetched and laid out.
      const fetched = fetchMock.mock.calls.map(([url]) => String(url));
      expect(fetched).toContain(checksumUrl);
      expect(fetched).toContain(archiveUrl);
      expect(fetched).not.toContain(vercelBuildpackArtifact(pinned).url);
      expect(cnbLayout).toEqual(buildpackFiles(entry));
      // order.toml names the pre-release version so the lifecycle finds it.
      expect(order).toContain('id = "vercel/ruby"');
      expect(order).toContain('version = "9.9.9"');
      expect(order).not.toContain(`version = "${pinned.version}"`);
      // The registry's runtime is left as pinned for the next build.
      expect(ruby.buildpacks[0]).toBe(pinned);
      expect(pinned.version).not.toBe('9.9.9');
    });

    it('builds locally with docker, baking Node.js into the build image', async () => {
      // No VERCEL_BUILD_IMAGE → docker engine, i.e. a local `vercel build`.
      // The machine has no /node22; Node comes from the official Node image
      // via a multi-stage COPY in the derived build image.
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      const distribution = await stageDistribution(ruby);
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock, {
        archiveContents: distribution.archiveContents,
      });
      vi.stubGlobal('fetch', fetchMock);

      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-local-'));
      writeFileSync(
        join(workPath, 'Gemfile'),
        'source "https://rubygems.org"\n'
      );
      writeFileSync(
        join(workPath, 'package.json'),
        JSON.stringify({ engines: { bun: '1.x' } })
      );
      writeFileSync(
        join(workPath, '.ruby-version'),
        'invalid host-only version'
      );
      seedExcludedProjectDirs(workPath);
      existsSyncMock.mockImplementation((p: unknown) => {
        try {
          statSync(p as string);
          return true;
        } catch {
          return false;
        }
      });

      const digest = `sha256:${'d'.repeat(64)}`;
      let dockerfile: string | undefined;
      let dockerBuildArgs: string[] | undefined;
      let platformNodeHome: string | undefined;
      let workspaceLayout: string[] | undefined;
      let stagedSource: string | undefined;
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'build') {
          dockerBuildArgs = args;
          writeFileSync(
            args[args.indexOf('--iidfile') + 1],
            `sha256:${'b'.repeat(64)}\n`
          );
          const child = fakeChild('');
          child.stdin = {
            end: (input: string) => {
              dockerfile = input;
            },
          };
          return child;
        }
        if (cmd === 'docker' && args[0] === 'cp') {
          if (args[2].endsWith(':/platform/env')) {
            platformNodeHome = readFileSync(
              join(args[1], 'VERCEL_NODE_HOME'),
              'utf8'
            );
          }
          if (args[2].endsWith(':/workspace')) {
            expect(args[1]).not.toBe(`${workPath}/.`);
            stagedSource = args[1];
            workspaceLayout = readdirSync(args[1]).sort();
          }
          if (args[1].endsWith(':/platform-output/report.toml')) {
            writeFileSync(args[2], `[image]\ndigest = "${digest}"\n`);
          }
          return fakeChild('');
        }
        return fakeChild('');
      });

      const resolveImage = vi.spyOn(ruby, 'resolveImage');
      let result;
      try {
        result = expectTypicalBuildResult(
          await build({
            ...createBuildOptions({ buildpack: 'ruby', framework: 'ruby' }),
            entrypoint: '<detect>',
            workPath,
            files: {
              Gemfile: new FileBlob({
                data: 'source "https://rubygems.org"\n',
              }),
              'package.json': new FileBlob({
                data: JSON.stringify({ engines: { node: '22.x' } }),
              }),
              '.ruby-version': new FileBlob({ data: '3.4.1\n' }),
            },
            meta: { skipDownload: true },
            service: { name: 'web' },
          } as any)
        );
        expect(resolveImage).toHaveBeenCalledOnce();
        expect(resolveImage).toHaveBeenCalledWith(dirname(stagedSource!));
      } finally {
        resolveImage.mockRestore();
        distribution.restore();
        rmSync(workPath, { recursive: true, force: true });
      }

      expect(result.output[CONTAINER_OUTPUT_PATH]).toMatchObject({
        handler: `vcr.vercel.com/acme/my-app/web@${digest}`,
      });

      // The derived build image bakes Node 22 in from the official image.
      expect(dockerfile).toContain(
        'FROM docker.io/library/node:22-bookworm-slim AS node'
      );
      expect(dockerfile).toContain('COPY --from=node /usr/local /node22');
      expect(dockerfile).toContain('FROM docker.io/library/ruby:3.4.1\n');
      expect(dockerfile).toContain('useradd --create-home --uid 1001');
      // Same `docker build` shape as the Dockerfile path: the Dockerfile comes
      // in on stdin and no builder-specific flags (e.g. `--load`) are passed.
      expect(dockerBuildArgs).toEqual([
        'build',
        '--pull',
        '--platform',
        'linux/amd64',
        '--tag',
        expect.stringMatching(/^vercel-cnb-build:[0-9a-f]{16}$/),
        '--iidfile',
        expect.stringContaining('build-image.id'),
        '-',
      ]);
      expect(platformNodeHome).toBe('/node22');
      // Only the filtered source map becomes the exported app layer.
      expect(workspaceLayout).toEqual([
        '.ruby-version',
        'Gemfile',
        'package.json',
      ]);
      expect(stagedSource).toBeDefined();
      expect(
        statSync(stagedSource!, { throwIfNoEntry: false })
      ).toBeUndefined();

      const commands = spawnMock.mock.calls.map(
        call => `${call[0]} ${(call[1] as string[]).join(' ')}`
      );
      expect(commands.some(c => c.startsWith('buildah'))).toBe(false);
      const creator = spawnMock.mock.calls.find(call =>
        (call[1] as string[]).some(a => a.includes('/cnb/lifecycle/creator'))
      );
      expect(creator?.[0]).toBe('docker');
      const creatorRunArgs = creator?.[1] as string[];
      expect(creatorRunArgs).toContain('--user');
      expect(creatorRunArgs).toContain('1001:1001');
      expect(creatorRunArgs).toContain(`sha256:${'b'.repeat(64)}`);
      expect(creatorRunArgs).toContain(
        '-run-image=docker.io/library/ruby:3.4.1'
      );
      expect(creatorRunArgs).toContain('--volumes-from');
      expect(creatorRunArgs).not.toContain('--volume');
      expect(
        commands.some(c => c.includes('login') && c.includes('vcr.vercel.com'))
      ).toBe(true);
    });

    it('omits the Node stage from the local build image without package.json', async () => {
      const { localBuildImageDockerfile, localBuildImageTag } = await import(
        '../src/buildpacks/lifecycle/docker'
      );
      const plain = localBuildImageDockerfile('docker.io/library/ruby:3.4');
      expect(plain).not.toContain('node');
      expect(plain).toContain('FROM docker.io/library/ruby:3.4');
      expect(plain).toContain('groupadd --gid 1001 cnb');

      const withNode = localBuildImageDockerfile(
        'docker.io/library/ruby:3.4',
        22
      );
      expect(withNode).toContain('COPY --from=node /usr/local /node22');
      // The tag is deterministic and input-sensitive.
      expect(localBuildImageTag(plain)).toBe(localBuildImageTag(plain));
      expect(localBuildImageTag(plain)).not.toBe(localBuildImageTag(withNode));
    });

    const lifecycleParams = () => ({
      workPath: '/workspace',
      image: {
        version: '3.4',
        buildImage: 'docker.io/library/ruby:3.4',
        runImage: 'docker.io/library/ruby:3.4',
      },
      imageRef: 'vcr.vercel.com/acme/my-app/web:build',
      credentials: {
        registry: 'vcr.vercel.com',
        username: 'team_test',
        token: 'test-token',
      },
    });

    it('rejects a distribution archive checksum mismatch', async () => {
      const { buildAndPushWithLifecycle } = await import(
        '../src/buildpacks/lifecycle/buildah'
      );
      const { BUILDPACK_DIST_BASE_URL, LIFECYCLE } = await import(
        '../src/buildpacks/distribution'
      );
      const original = { lifecycle: LIFECYCLE.sha256 };
      const [entry] = ruby.buildpacks;
      const originalBuildpack = entry.sha256;
      // Both pinned to checksums no served bytes can match.
      LIFECYCLE.sha256 = '1'.repeat(64);
      entry.sha256 = '2'.repeat(64);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () =>
            new TextEncoder().encode('unexpected archive').buffer,
        })
      );
      spawnMock.mockImplementation(() => fakeChild(''));

      try {
        const error: Error = await buildAndPushWithLifecycle(
          ruby,
          lifecycleParams(),
          new BuildahClient(sharedBuildahStoreLock)
        ).catch(e => e);
        expect(error.message).toMatch(/checksum/i);
        // Archive locations stay out of build logs.
        expect(error.message).not.toContain(BUILDPACK_DIST_BASE_URL);
      } finally {
        LIFECYCLE.sha256 = original.lifecycle;
        entry.sha256 = originalBuildpack;
      }
    });

    const unavailable = () =>
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
    const buildahCommands = () =>
      spawnMock.mock.calls
        .filter(([cmd]) => cmd === 'buildah')
        .map(([, args]) => args as string[]);

    it('pulls the build image and fetches the lifecycle while the registry is prepared', async () => {
      const { buildAndPushWithLifecycle } = await import(
        '../src/buildpacks/lifecycle/buildah'
      );
      const fetchMock = unavailable();
      vi.stubGlobal('fetch', fetchMock);
      spawnMock.mockImplementation(() => fakeChild(''));

      let overlapped = false;
      const error: Error = await buildAndPushWithLifecycle(
        ruby,
        {
          ...lifecycleParams(),
          prepareRegistry: async () => {
            await vi.waitFor(() => {
              expect(
                buildahCommands().some(args => args.includes('from'))
              ).toBe(true);
              expect(fetchMock).toHaveBeenCalled();
            });
            overlapped = true;
          },
        },
        new BuildahClient(sharedBuildahStoreLock)
      ).catch(e => e);

      expect(overlapped).toBe(true);
      // The failed download is still reported once every task settled.
      expect(error.message).toMatch(/HTTP 503/);
    });

    it('preserves a registry failure even when cache scratch cleanup fails', async () => {
      const { buildAndPushWithLifecycle } = await import(
        '../src/buildpacks/lifecycle/buildah'
      );
      const cacheModule = await import('../src/buildpacks/cache');
      const restoreCache = vi.spyOn(cacheModule, 'restoreBuildpackCache');
      const fs = await import('node:fs');
      const removeDirectory = fs.rmSync;
      const cleanup = vi
        .spyOn(fs, 'rmSync')
        .mockImplementation((path, options) => {
          if (
            restoreCache.mock.calls.some(
              ([, , cacheDir]) => dirname(cacheDir) === path
            )
          ) {
            throw new Error('cache scratch cleanup failed');
          }
          removeDirectory(path, options);
        });
      const cacheDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-failed-cache-'));
      vi.stubGlobal('fetch', unavailable());
      spawnMock.mockImplementation(() => fakeChild(''));
      const rejected = new Error(
        'Authentication to vcr.vercel.com as "team_test" was rejected.'
      );

      try {
        const error = await buildAndPushWithLifecycle(
          ruby,
          {
            ...lifecycleParams(),
            cache: { dir: cacheDir },
            prepareRegistry: async () => {
              throw rejected;
            },
          },
          new BuildahClient(sharedBuildahStoreLock)
        ).catch(e => e);

        expect(error).toBe(rejected);
        expect(restoreCache).toHaveBeenCalledOnce();
        expect(cleanup).toHaveBeenCalledWith(
          dirname(restoreCache.mock.calls[0][2]),
          {
            recursive: true,
            force: true,
          }
        );
        // The container is removed only after its workspace copy finished.
        const commands = buildahCommands();
        const copy = commands.findIndex(args => args.includes('copy'));
        const remove = commands.findIndex(args => args.includes('rm'));
        expect(copy).toBeGreaterThanOrEqual(0);
        expect(remove).toBeGreaterThan(copy);
      } finally {
        cleanup.mockRestore();
        for (const [, , restoredCacheDir] of restoreCache.mock.calls) {
          rmSync(dirname(restoredCacheDir), { recursive: true, force: true });
        }
        restoreCache.mockRestore();
        rmSync(cacheDir, { recursive: true, force: true });
      }
    });

    it('still reports a failed pull as a lifecycle failure', async () => {
      const { buildAndPushWithLifecycle } = await import(
        '../src/buildpacks/lifecycle/buildah'
      );
      vi.stubGlobal('fetch', unavailable());
      spawnMock.mockImplementation((_cmd: string, args: string[]) =>
        args.includes('from')
          ? fakeChildFailure('manifest unknown')
          : fakeChild('')
      );

      const error: Error = await buildAndPushWithLifecycle(
        ruby,
        lifecycleParams(),
        new BuildahClient(sharedBuildahStoreLock)
      ).catch(e => e);

      expect(error.message).toMatch(
        /^ruby buildpack build failed via lifecycle\/creator/
      );
      expect(error.message).toContain('manifest unknown');
      expect(error.message).not.toMatch(/HTTP 503/);
    });

    it.each([
      true,
      false,
    ])('lays out a .cnb buildpackage for the lifecycle (absolute paths: %s)', async absolute => {
      const { fetchBuildpackage } = await import(
        '../src/buildpacks/lifecycle/lifecycle'
      );
      const [entry] = ruby.buildpacks;
      const buildpackage = await buildpackageBytes(entry, { absolute });
      const archive = {
        url: 'https://archives.test/vercel-ruby-0.1.0.cnb',
        sha256: sha256Hex(buildpackage),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () => Uint8Array.from(buildpackage).buffer,
        })
      );
      const cnbDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-layout-'));
      try {
        await fetchBuildpackage(archive, cnbDir);
        // OCI layer entries are `/cnb/buildpacks/...`; the mount is /cnb.
        expect(readdirSync(cnbDir)).toEqual(['buildpacks']);
        expect(
          readFileSync(
            join(cnbDir, buildpackDir(entry), 'buildpack.toml'),
            'utf8'
          )
        ).toContain(`id = "${entry.id}"`);
        expect(
          readdirSync(join(cnbDir, buildpackDir(entry), 'bin')).sort()
        ).toEqual(['build', 'detect']);
      } finally {
        rmSync(cnbDir, { recursive: true, force: true });
      }
    });

    it('rejects a .cnb layer whose bytes do not match its digest', async () => {
      const { fetchBuildpackage } = await import(
        '../src/buildpacks/lifecycle/lifecycle'
      );
      const buildpackage = await buildpackageBytes(ruby.buildpacks[0], {
        corruptLayer: true,
      });
      const archive = {
        url: 'https://archives.test/vercel-ruby-0.1.0.cnb',
        sha256: sha256Hex(buildpackage),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () => Uint8Array.from(buildpackage).buffer,
        })
      );
      const cnbDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-layout-'));
      try {
        await expect(fetchBuildpackage(archive, cnbDir)).rejects.toThrow(
          /layer sha256:[0-9a-f]{64} hashes to sha256:/
        );
        expect(readdirSync(cnbDir)).toEqual([]);
      } finally {
        rmSync(cnbDir, { recursive: true, force: true });
      }
    });

    it('reads the exported digest from the lifecycle report', async () => {
      const { readReportDigest } = await import(
        '../src/buildpacks/lifecycle/lifecycle'
      );
      const digest = `sha256:${'b'.repeat(64)}`;
      const other = `sha256:${'c'.repeat(64)}`;

      expect(
        readReportDigest(
          [
            '[build]',
            `base-image-digest = "${other}"`,
            '',
            '[image]',
            'tags = ["vcr.vercel.com/acme/app:abc"]',
            `digest = "${digest}"`,
            'manifest-size = 2003',
          ].join('\n')
        )
      ).toBe(digest);

      // A bare regex over the file would have returned the build digest above.
      expect(readReportDigest('[image]\ntags = []\n')).toBeUndefined();
      expect(readReportDigest('not toml at all {{{')).toBeUndefined();
      expect(
        readReportDigest('[image]\ndigest = "not-a-digest"\n')
      ).toBeUndefined();
    });
  });
});

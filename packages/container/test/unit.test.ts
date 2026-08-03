import type { BuildResultV2Typical } from '@vercel/build-utils';
import { sanitizeConsumerName } from '@vercel/build-utils';
import { EventEmitter } from 'node:events';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { build, prepareCache, startDevServer } from '../src';
import { __resetStorageDriverCache } from '../src/storage-driver';
import { __resetRunningContainers } from '../src/dev';

const { spawnMock, existsSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock('node:child_process', async importActual => {
  const actual = await importActual<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnMock };
});

vi.mock('node:fs', async importActual => {
  const actual = await importActual<typeof import('node:fs')>();
  return { ...actual, existsSync: existsSyncMock };
});

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

function stubRegistryFetch(
  fetchMock: ReturnType<typeof vi.fn>,
  options: { repositoryStatus?: number; mintStatus?: number } = {}
) {
  const repositoryStatus = options.repositoryStatus ?? 200;
  const mintStatus = options.mintStatus ?? 200;
  fetchMock.mockImplementation((url: string | URL) => {
    const href = String(url);
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
  return child;
}

/** Fake child process that emits the given stdout, then exits successfully. */
function fakeChild(stdout = '') {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: vi.fn() };
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
  'VERCEL_VCR_DISABLE_LAYER_CACHE',
  'VERCEL_VCR_FORCE_LOGIN',
  'REGISTRY_AUTH_FILE',
  'XDG_CONFIG_HOME',
];

beforeEach(() => {
  existsSyncMock.mockReturnValue(false);
  spawnMock.mockReset();
  __resetStorageDriverCache();
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

describe('@vercel/container', () => {
  it('passes the container image reference through as build output', async () => {
    const result = await build(
      createBuildOptions({ handler: 'docker.io/library/nginx:1.27' })
    );

    expect(result).toEqual({
      routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }],
      output: {
        index: {
          type: 'Lambda',
          files: {},
          handler: 'docker.io/library/nginx:1.27',
          runtime: 'container',
          environment: {},
        },
      },
    });
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

    expect(result.output.index).toMatchObject({
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

    expect(result.output.index).toMatchObject({
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

    expect(result.output.index).toMatchObject({
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

    expect(result.output.index).toMatchObject({
      handler: 'docker.io/library/nginx:1.27',
      command: ['nginx -g daemon off;'],
    });
  });

  it('does a normal build with a catch-all route for services', async () => {
    // The function lands at the natural `index` path (no `_svc` namespacing) so
    // the nested `services/<name>/` output "just works", with a catch-all route
    // to reach it.
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({}),
        entrypoint: 'docker.io/library/nginx:1.27',
        service: {
          name: 'api',
        },
      })
    );

    expect(result.output).toHaveProperty('index');
    expect(result.output).not.toHaveProperty('_svc/api/index');
    expect(result.output.index).toMatchObject({
      handler: 'docker.io/library/nginx:1.27',
      runtime: 'container',
      environment: {},
    });

    // Without a catch-all, a request to the service root never reaches the
    // Lambda inside the isolated per-service route table.
    expect(result.routes).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ]);
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

    expect(result.output).toHaveProperty('index');
    expect(result.routes).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ]);
  });

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
      if (typeof p === 'string' && p.includes('containers/auth.json')) {
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
        service: { name: 'api' },
        ...(options?.meta ? { meta: options.meta } : {}),
      } as any)
    );

    expect(result.output.index).toMatchObject({
      type: 'Lambda',
      runtime: 'container',
      handler: `vcr.vercel.com/acme/my-app/api@${digest}`,
    });

    return spawnMock.mock.calls.map(call => {
      const [cmd, args] = call as [string, string[]];
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
  ])('builds from a `%s` opt-in marker entrypoint, passing it via -f', async marker => {
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

    // No service name → output at `index`, with the catch-all so `/` reaches
    // it. Repository leaf comes from the Dockerfile base name (`dockerfile`).
    expect(result.output).toHaveProperty('index');
    expect(result.output.index).toMatchObject({
      type: 'Lambda',
      runtime: 'container',
      handler: `vcr.vercel.com/acme/my-app/dockerfile@${digest}`,
    });
    expect(result.routes).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ]);
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

    expect(result.output.index).toMatchObject({
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

    expect(result.output.index).toMatchObject({
      handler: `vcr.vercel.com/acme/my-app/api@${digest}`,
    });
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
      if (typeof p === 'string' && p.includes('containers/auth.json')) {
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
    const baseOpts = {
      files: {},
      entrypoint: 'apps/whoami/Dockerfile',
      workPath: '/vercel',
      repoRootPath: '/vercel',
      config: {},
    } as any;

    it('is a no-op outside the build container', async () => {
      // VERCEL_BUILD_IMAGE unset => not the build container.
      const result = await prepareCache(baseOpts);
      expect(result).toEqual({});
    });

    it('is a no-op when the layer cache is disabled', async () => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_VCR_DISABLE_LAYER_CACHE = '1';
      try {
        const result = await prepareCache(baseOpts);
        expect(result).toEqual({});
      } finally {
        delete process.env.VERCEL_VCR_DISABLE_LAYER_CACHE;
      }
    });

    it('is a no-op when the buildah store directory does not exist', async () => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      existsSyncMock.mockReturnValue(false); // graphroot missing
      const result = await prepareCache(baseOpts);
      expect(result).toEqual({});
    });
  });

  describe('buildpacks (Ruby)', () => {
    let BUILDPACKS: typeof import('../src/buildpacks/registry').BUILDPACKS;
    let ruby: import('../src/buildpacks/registry').BuildpackDescriptor;
    let requestedBuildpack: typeof import('../src/buildpacks/registry').requestedBuildpack;
    let resolveImageSource: typeof import('../src/image-source').resolveImageSource;

    beforeAll(async () => {
      const registry = await import('../src/buildpacks/registry');
      BUILDPACKS = registry.BUILDPACKS;
      requestedBuildpack = registry.requestedBuildpack;
      ruby = registry.BUILDPACKS.find(bp => bp.runtime === 'ruby')!;
      resolveImageSource = (await import('../src/image-source'))
        .resolveImageSource;
    });

    it('pins the builder and run images by digest and declares a buildpack group', () => {
      // Deploys run the builder on Vercel infrastructure — a mutable tag
      // would silently track upstream pushes.
      for (const bp of BUILDPACKS) {
        expect(bp.builder).toMatch(/@sha256:[0-9a-f]{64}$/);
        expect(bp.runImage).toMatch(/@sha256:[0-9a-f]{64}$/);
        expect(bp.buildpackGroup.length).toBeGreaterThan(0);
      }
    });

    it('keeps Ruby launch defaults in the Ruby descriptor using user-facing names', () => {
      // The `true` values match what Paketo's rails-assets buildpack
      // contributes for Rails apps (first-set-wins), so the observed value
      // is identical for Rails and non-Rails apps.
      expect(ruby.launchEnvDefaults).toEqual({
        RAILS_ENV: 'production',
        RACK_ENV: 'production',
        RAILS_LOG_TO_STDOUT: 'true',
        RAILS_SERVE_STATIC_FILES: 'true',
      });
    });

    it('resolves dev images per descriptor without language-specific branches', async () => {
      const { devBuilderImageRef, devRunImageRef, hasProjectMarkers } =
        await import('../src/buildpacks/registry');
      const synthetic = {
        runtime: 'elixir',
        projectMarkers: ['mix.exs'],
        builder: 'example/builder-elixir@sha256:deadbeef',
        runImage: 'example/run-elixir@sha256:deadbeef',
        buildpackGroup: [{ id: 'example/elixir', version: '1.2.3' }],
      };

      expect(devBuilderImageRef(synthetic)).toBe(synthetic.builder);
      expect(devRunImageRef(synthetic)).toBe(synthetic.runImage);

      process.env.VERCEL_BUILDPACK_ELIXIR_BUILDER = 'example/custom:tag';
      try {
        expect(devBuilderImageRef(synthetic)).toBe('example/custom:tag');
        // A custom builder may target a different stack; never pair it with
        // the pinned default run image.
        expect(devRunImageRef(synthetic)).toBeUndefined();
        process.env.VERCEL_BUILDPACK_ELIXIR_RUN_IMAGE = 'example/run:tag';
        expect(devRunImageRef(synthetic)).toBe('example/run:tag');
      } finally {
        delete process.env.VERCEL_BUILDPACK_ELIXIR_BUILDER;
        delete process.env.VERCEL_BUILDPACK_ELIXIR_RUN_IMAGE;
      }

      existsSyncMock.mockImplementation((p: string) => p === '/mix.exs');
      expect(hasProjectMarkers(synthetic, '/')).toBe(true);
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
      expect(hasProjectMarkers(synthetic, '/')).toBe(false);
    });

    it('fails dev builds when an overridden builder has no resolvable run image', async () => {
      process.env.VERCEL_BUILDPACK_RUBY_BUILDER = 'example/custom-builder:tag';
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (
          cmd === 'docker' &&
          args[0] === 'image' &&
          args.includes('io.buildpacks.builder.metadata')
        ) {
          return fakeChild('');
        }
        if (cmd === 'docker' && args[0] === 'image' && args[1] === 'inspect') {
          return fakeChild('linux/amd64\n');
        }
        return fakeChild('');
      });

      try {
        await expect(
          startDevServer({
            ...createBuildOptions({ buildpack: 'ruby' }),
            entrypoint: '<detect>',
            service: { name: 'ruby-api' },
            meta: { isDev: true },
          } as any)
        ).rejects.toThrow(/VERCEL_BUILDPACK_RUBY_RUN_IMAGE/);
      } finally {
        delete process.env.VERCEL_BUILDPACK_RUBY_BUILDER;
      }
    });

    it('applies overridable production env defaults beneath the user build env', async () => {
      const { mergeDefaultBuildEnv } = await import(
        '../src/buildpacks/lifecycle'
      );

      const synthetic = {
        runtime: 'elixir',
        projectMarkers: ['mix.exs'],
        builder: 'example/builder-elixir@sha256:deadbeef',
        runImage: 'example/run-elixir@sha256:deadbeef',
        buildpackGroup: [{ id: 'example/elixir', version: '1.2.3' }],
        launchEnvDefaults: {
          APP_ENV: 'production',
          LOG_TO_STDOUT: 'enabled',
        },
      };

      const defaulted = mergeDefaultBuildEnv(synthetic, {
        BP_LANGUAGE_VERSION: '1.17',
      });
      expect(defaulted.buildEnv).toMatchObject({
        BP_LANGUAGE_VERSION: '1.17',
        BPE_DEFAULT_APP_ENV: 'production',
        BPE_DEFAULT_LOG_TO_STDOUT: 'enabled',
      });
      expect(defaulted.applied.join('\n')).toContain(
        'Defaulting APP_ENV=production'
      );

      // A plain user value becomes both build and embedded launch env, while
      // an explicit BPE_DEFAULT_* value remains a launch default.
      const overridden = mergeDefaultBuildEnv(synthetic, {
        APP_ENV: 'staging',
        BPE_DEFAULT_LOG_TO_STDOUT: 'custom-default',
      });
      expect(overridden.buildEnv).not.toHaveProperty('BPE_DEFAULT_APP_ENV');
      expect(overridden.buildEnv).toMatchObject({
        APP_ENV: 'staging',
        BPE_APP_ENV: 'staging',
        BPE_DEFAULT_LOG_TO_STDOUT: 'custom-default',
      });
      expect(overridden.applied.join('\n')).not.toContain('APP_ENV');

      // Explicit embedded overrides win, and unrelated build env is not
      // copied into the image.
      const explicitlyOverridden = mergeDefaultBuildEnv(synthetic, {
        APP_ENV: 'plain-value',
        BPE_APP_ENV: 'embedded-value',
        SECRET: 'build-only',
      });
      expect(explicitlyOverridden.buildEnv).toMatchObject({
        APP_ENV: 'plain-value',
        BPE_APP_ENV: 'embedded-value',
        SECRET: 'build-only',
      });
      expect(explicitlyOverridden.buildEnv).not.toHaveProperty(
        'BPE_DEFAULT_APP_ENV'
      );
      expect(explicitlyOverridden.buildEnv).not.toHaveProperty('BPE_SECRET');
      expect(explicitlyOverridden.applied.join('\n')).not.toContain('APP_ENV=');

      // Descriptors without defaults pass the env through untouched.
      const none = mergeDefaultBuildEnv(
        { ...synthetic, launchEnvDefaults: undefined },
        undefined
      );
      expect(none).toEqual({ buildEnv: undefined, applied: [] });
    });

    it('merges declared launch overrides from process env without forwarding ambient env', async () => {
      const { mergeDefaultBuildEnv } = await import(
        '../src/buildpacks/lifecycle'
      );

      const merged = mergeDefaultBuildEnv(ruby, undefined, {
        RACK_ENV: 'fixture-override',
        VERCEL_OIDC_TOKEN: 'must-not-be-forwarded',
      });

      expect(merged.buildEnv).toMatchObject({
        RACK_ENV: 'fixture-override',
        BPE_RACK_ENV: 'fixture-override',
      });
      expect(merged.buildEnv).not.toHaveProperty('BPE_DEFAULT_RACK_ENV');
      expect(merged.buildEnv).not.toHaveProperty('VERCEL_OIDC_TOKEN');
      expect(merged.applied.join('\n')).not.toContain('RACK_ENV=');
    });

    it('describes CNB lifecycle creator exit codes by phase', async () => {
      const { describeCreatorExitCode } = await import(
        '../src/buildpacks/lifecycle'
      );
      expect(describeCreatorExitCode(20)).toBe('no buildpack detected the app');
      expect(describeCreatorExitCode(21)).toMatch(/errored during detection/);
      expect(describeCreatorExitCode(51)).toMatch(
        /failed while building the app/
      );
      expect(describeCreatorExitCode(52)).toBe('the build phase failed');
      expect(describeCreatorExitCode(62)).toMatch(/export phase/);
      // Unknown / generic codes get no interpretation.
      expect(describeCreatorExitCode(1)).toBeUndefined();
      expect(describeCreatorExitCode(undefined)).toBeUndefined();
    });

    it('resolves the buildpack from either config channel and honors marker precedence', () => {
      expect(requestedBuildpack({ buildpack: 'ruby' })).toBe(ruby);
      expect(requestedBuildpack({ framework: 'ruby' })).toBe(ruby);
      expect(requestedBuildpack({ runtime: 'container' })).toBeUndefined();

      const options = (config: Record<string, unknown>) => ({
        config,
        workPath: '/',
        entrypoint: '<detect>',
      });

      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
      expect(
        resolveImageSource(options({ buildpack: 'ruby' }), 'build')
      ).toMatchObject({ kind: 'buildpack', buildpack: { runtime: 'ruby' } });

      // Only a `.vercel` marker opts out of buildpacks; a conventional
      // Dockerfile can coexist with a buildpack build.
      existsSyncMock.mockImplementation(
        (p: string) => p === '/Gemfile' || p === '/Dockerfile'
      );
      expect(
        resolveImageSource(options({ buildpack: 'ruby' }), 'build')
      ).toMatchObject({ kind: 'buildpack', buildpack: { runtime: 'ruby' } });
      existsSyncMock.mockImplementation(
        (p: string) => p === '/Gemfile' || p === '/Dockerfile.vercel'
      );
      expect(
        resolveImageSource(options({ buildpack: 'ruby' }), 'build')
      ).toMatchObject({
        kind: 'dockerfile',
        dockerfileRel: 'Dockerfile.vercel',
      });

      // A Procfile is not language evidence — it must not mark a project as
      // a Ruby buildpack project on its own.
      existsSyncMock.mockImplementation((p: string) => p === '/Procfile');
      expect(() =>
        resolveImageSource(options({ buildpack: 'ruby' }), 'build')
      ).toThrow(/no supported project marker/i);
    });

    it('returns an actionable error when the selected Ruby project has no markers', async () => {
      existsSyncMock.mockReturnValue(false);
      await expect(
        build({
          ...createBuildOptions({ buildpack: 'ruby' }),
          entrypoint: '<detect>',
          service: { name: 'api' },
        })
      ).rejects.toThrow(/Ruby buildpack.*no supported project marker/i);
    });

    it('returns a local container tag and preserves an optional command in dev', async () => {
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
      const result = expectTypicalBuildResult(
        await build({
          ...createBuildOptions({
            buildpack: 'ruby',
            command: ['bundle', 'exec', 'puma'],
          }),
          entrypoint: '<detect>',
          service: { name: 'api' },
          meta: { isDev: true },
        } as any)
      );
      expect(result.output.index).toMatchObject({
        runtime: 'container',
        handler: 'vercel-dev/api:dev',
        command: ['bundle', 'exec', 'puma'],
      });
    });

    it('exports a Ruby buildpack image directly to VCR with isolated auth', async () => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock);
      vi.stubGlobal('fetch', fetchMock);
      const digest = `sha256:${'b'.repeat(64)}`;
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
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
        if (cmd === 'buildah' && args.includes('/cnb/lifecycle/creator')) {
          const reportMount = args
            .filter((_arg, index) => args[index - 1] === '--volume')
            .find(arg => arg.endsWith(':/platform-output'));
          expect(reportMount).toBeDefined();
          writeFileSync(
            `${reportMount!.slice(0, -':/platform-output'.length)}/report.toml`,
            `[image]\ndigest = "${digest}"\n`
          );
        }
        return fakeChild('');
      });

      const result = expectTypicalBuildResult(
        await build({
          ...createBuildOptions({ buildpack: 'ruby' }),
          entrypoint: '<detect>',
          service: { name: 'api' },
        })
      );
      expect(result.output.index).toMatchObject({
        runtime: 'container',
        handler: `vcr.vercel.com/acme/my-app/api@${digest}`,
      });

      const creatorCall = spawnMock.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'buildah' &&
          (args as string[]).includes('/cnb/lifecycle/creator')
      );
      expect(creatorCall).toBeDefined();
      const creatorArgs = creatorCall?.[1] as string[];
      const creatorOptions = creatorCall?.[2] as {
        env?: NodeJS.ProcessEnv;
      };
      expect(creatorArgs).toContain('CNB_REGISTRY_AUTH');
      expect(creatorArgs.join(' ')).not.toContain(
        process.env.VERCEL_OIDC_TOKEN!
      );
      expect(creatorOptions.env?.CNB_REGISTRY_AUTH).toMatch(
        /"vcr\.vercel\.com":"Basic /
      );
      // Exports against the pinned run image rather than whatever mutable tag
      // the builder metadata references.
      expect(creatorArgs).toContain(`-run-image=${ruby.runImage}`);
      const builderFromCall = spawnMock.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'buildah' && (args as string[]).includes('from')
      );
      expect((builderFromCall?.[1] as string[]).join(' ')).toContain(
        ruby.builder
      );
    });

    it('ignores VERCEL_BUILDPACK_* image overrides on deploys', async () => {
      // The env overrides are a dev/testing tool. In production they would
      // be reachable through user-supplied build env, so deploys must always
      // run the pinned, digest-reviewed builder and run images.
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      process.env.VERCEL_BUILDPACK_RUBY_BUILDER = 'example/evil-builder:tag';
      process.env.VERCEL_BUILDPACK_RUBY_RUN_IMAGE = 'example/evil-run:tag';
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock);
      vi.stubGlobal('fetch', fetchMock);
      const digest = `sha256:${'c'.repeat(64)}`;
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
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
        if (cmd === 'buildah' && args.includes('/cnb/lifecycle/creator')) {
          const reportMount = args
            .filter((_arg, index) => args[index - 1] === '--volume')
            .find(arg => arg.endsWith(':/platform-output'));
          expect(reportMount).toBeDefined();
          writeFileSync(
            `${reportMount!.slice(0, -':/platform-output'.length)}/report.toml`,
            `[image]\ndigest = "${digest}"\n`
          );
        }
        return fakeChild('');
      });

      try {
        await build({
          ...createBuildOptions({ buildpack: 'ruby' }),
          entrypoint: '<detect>',
          service: { name: 'api' },
        });
      } finally {
        delete process.env.VERCEL_BUILDPACK_RUBY_BUILDER;
        delete process.env.VERCEL_BUILDPACK_RUBY_RUN_IMAGE;
      }

      const builderFromCall = spawnMock.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'buildah' && (args as string[]).includes('from')
      );
      const fromArgs = (builderFromCall?.[1] as string[]).join(' ');
      expect(fromArgs).toContain(ruby.builder);
      expect(fromArgs).not.toContain('example/evil-builder:tag');

      const creatorCall = spawnMock.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'buildah' &&
          (args as string[]).includes('/cnb/lifecycle/creator')
      );
      const creatorArgs = creatorCall?.[1] as string[];
      expect(creatorArgs).toContain(`-run-image=${ruby.runImage}`);
      expect(creatorArgs).not.toContain('-run-image=example/evil-run:tag');
    });

    it('cleans up the Buildah working container when export fails', async () => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock);
      vi.stubGlobal('fetch', fetchMock);
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
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
        if (cmd === 'buildah' && args.includes('/cnb/lifecycle/creator')) {
          // 51: lifecycle build-phase failure (a buildpack's /bin/build errored).
          return fakeChildFailure('ERROR: failed to build: exit status 1', 51);
        }
        return fakeChild('');
      });

      const failure = await build({
        ...createBuildOptions({ buildpack: 'ruby' }),
        entrypoint: '<detect>',
        service: { name: 'api' },
      }).then(
        () => undefined,
        err => err as Error
      );
      expect(failure?.message).toContain('exited with code 51');
      // The wrapper explains the lifecycle exit code instead of leaving a
      // bare number.
      expect(failure?.message).toContain(
        'The lifecycle exited with code 51: a buildpack failed while building the app'
      );
      const cleanupArgs = spawnMock.mock.calls.find(
        ([cmd, args]) => cmd === 'buildah' && (args as string[]).includes('rm')
      )?.[1] as string[] | undefined;
      expect(cleanupArgs).toBeDefined();
      expect(cleanupArgs).not.toContain('--force');
      expect(cleanupArgs?.at(-1)).toMatch(/^vercel-cnb-ruby-/);
    });

    it('builds and starts a Ruby buildpack image in local dev', async () => {
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'image' && args[1] === 'inspect') {
          return fakeChild('linux/amd64\n');
        }
        if (
          cmd === 'docker' &&
          args[0] === 'run' &&
          args.includes('/cnb/lifecycle/creator')
        ) {
          expect(args).toContain(`-run-image=${ruby.runImage}`);
          const platformEnvMount = args
            .filter((_arg, index) => args[index - 1] === '-v')
            .find(arg => arg.endsWith(':/platform/env:ro'));
          expect(platformEnvMount).toBeDefined();
          const platformEnvDir = platformEnvMount!.slice(
            0,
            -':/platform/env:ro'.length
          );
          expect(readFileSync(`${platformEnvDir}/BP_MRI_VERSION`, 'utf8')).toBe(
            '3.3'
          );
          // Dev applies the same overridable production defaults as deploys.
          expect(
            readFileSync(`${platformEnvDir}/BPE_DEFAULT_RAILS_ENV`, 'utf8')
          ).toBe('production');
          // Dev detects with the same explicit buildpack order as deploys.
          expect(args).toContain('-order=/platform/order/order.toml');
          const orderMount = args
            .filter((_arg, index) => args[index - 1] === '-v')
            .find(arg => arg.endsWith(':/platform/order:ro'));
          expect(
            readFileSync(
              `${orderMount!.slice(0, -':/platform/order:ro'.length)}/order.toml`,
              'utf8'
            )
          ).toContain('version = "2.0.1"');
          return fakeChild('');
        }
        if (cmd === 'docker' && args[0] === 'run') {
          return fakeRunningChild(4343);
        }
        if (cmd === 'docker' && args.includes('inspect')) {
          return fakeChild('{"8080/tcp":{}}');
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:54322\n');
        }
        return fakeChild('');
      });

      const result = await startDevServer({
        ...createBuildOptions({ buildpack: 'ruby' }),
        entrypoint: '<detect>',
        service: { name: 'ruby-api' },
        meta: { isDev: true, buildEnv: { BP_MRI_VERSION: '3.3' } },
      } as any);
      expect(result).toMatchObject({ port: 54322, pid: 4343 });
      const commands = spawnMock.mock.calls.map(([cmd, args]) =>
        [cmd, ...(args as string[])].join(' ')
      );
      expect(
        commands.some(
          command =>
            command.includes('docker pull') && command.includes(ruby.builder)
        )
      ).toBe(true);
      expect(
        commands.some(
          command =>
            command.includes('docker pull --platform linux/amd64') &&
            command.includes(ruby.runImage)
        )
      ).toBe(true);
      expect(
        commands.some(
          command =>
            command.includes('/cnb/lifecycle/creator') &&
            command.includes('docker run --platform linux/amd64') &&
            command.includes('vercel-dev/ruby-api:dev')
        )
      ).toBe(true);
      await result!.shutdown!();
    });

    it('explains creator exit codes when a dev buildpack build fails', async () => {
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'docker' && args[0] === 'image' && args[1] === 'inspect') {
          return fakeChild('linux/amd64\n');
        }
        if (
          cmd === 'docker' &&
          args[0] === 'run' &&
          args.includes('/cnb/lifecycle/creator')
        ) {
          return fakeChildFailure('ERROR: No buildpack groups passed', 20);
        }
        return fakeChild('');
      });

      await expect(
        startDevServer({
          ...createBuildOptions({ buildpack: 'ruby' }),
          entrypoint: '<detect>',
          service: { name: 'ruby-api' },
          meta: { isDev: true },
        } as any)
      ).rejects.toThrow(
        /exited with code 20 \(no buildpack detected the app\)/
      );
    });

    it('runs a dev command override through the CNB launcher', async () => {
      existsSyncMock.mockImplementation((p: string) => p === '/Gemfile');
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (
          cmd === 'docker' &&
          args[0] === 'run' &&
          args.includes('/cnb/lifecycle/creator')
        ) {
          return fakeChild('');
        }
        if (cmd === 'docker' && args[0] === 'run') {
          return fakeRunningChild(4444);
        }
        if (cmd === 'docker' && args.includes('inspect')) {
          return fakeChild('{"8080/tcp":{}}');
        }
        if (cmd === 'docker' && args[0] === 'port') {
          return fakeChild('127.0.0.1:54323\n');
        }
        return fakeChild('');
      });

      const result = await startDevServer({
        ...createBuildOptions({
          buildpack: 'ruby',
          command: ['bundle', 'exec', 'puma'],
        }),
        entrypoint: '<detect>',
        service: { name: 'ruby-api' },
        meta: { isDev: true },
      } as any);
      expect(result).toMatchObject({ port: 54323 });

      // The image entrypoint is the default web process; a raw command would
      // be appended to it. The override must exec via the launcher instead.
      const runArgs = spawnMock.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'docker' &&
          (args as string[])[0] === 'run' &&
          !(args as string[]).includes('/cnb/lifecycle/creator')
      )?.[1] as string[];
      const entrypointIdx = runArgs.indexOf('--entrypoint');
      expect(entrypointIdx).toBeGreaterThanOrEqual(0);
      expect(runArgs[entrypointIdx + 1]).toBe('launcher');
      expect(runArgs[runArgs.indexOf('vercel-dev/ruby-api:dev') + 1]).toBe(
        '--'
      );
      expect(runArgs.slice(-3)).toEqual(['bundle', 'exec', 'puma']);
      await result!.shutdown!();
    });

    it('bakes a deploy command override into the image via a Procfile web process', async () => {
      process.env.VERCEL_BUILD_IMAGE = 'al2023';
      process.env.VERCEL_OIDC_TOKEN = fakeOidcToken();
      const originalRackEnv = process.env.RACK_ENV;
      const fetchMock = vi.fn();
      stubRegistryFetch(fetchMock);
      vi.stubGlobal('fetch', fetchMock);
      const digest = `sha256:${'c'.repeat(64)}`;
      // Production starts container services from the image's OCI config, so
      // the override must land in the image itself. The Procfile write and the
      // platform env dir hit the real filesystem — use a real workPath.
      const workPath = mkdtempSync(join(tmpdir(), 'vercel-cnb-test-'));
      existsSyncMock.mockImplementation((p: string) => p.endsWith('/Gemfile'));
      // The Procfile is written to a temp dir and `buildah copy`ed into the
      // working container, never the source tree; capture its content while
      // the temp file still exists.
      let stagedProcfile: string | undefined;
      let stagedOrder: string | undefined;
      let stagedDefaultRailsEnv: string | undefined;
      let stagedRackEnv: string | undefined;
      const copyCalls: string[][] = [];
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
        if (
          cmd === 'buildah' &&
          args.some(arg => arg.includes('CNB_USER_ID'))
        ) {
          // The build-user probe reads CNB_USER_ID/CNB_GROUP_ID from the
          // builder image's env. It must use host networking: the build
          // sandbox cannot set up bridge networking (netavark/iptables).
          expect(args.join(' ')).toContain('--network host');
          return fakeChild('1001:1000\n');
        }
        if (cmd === 'buildah' && args.includes('copy')) {
          copyCalls.push([...args]);
          if (args.at(-1) === '/workspace/Procfile') {
            stagedProcfile = readFileSync(args.at(-2)!, 'utf8');
          }
          return fakeChild('');
        }
        if (cmd === 'buildah' && args.includes('/cnb/lifecycle/creator')) {
          const mounts = args.filter(
            (_arg, index) => args[index - 1] === '--volume'
          );
          const reportMount = mounts.find(arg =>
            arg.endsWith(':/platform-output')
          );
          writeFileSync(
            `${reportMount!.slice(0, -':/platform-output'.length)}/report.toml`,
            `[image]\ndigest = "${digest}"\n`
          );
          // The app is copied into the container, not bind-mounted.
          expect(mounts.some(arg => arg.endsWith(':/workspace'))).toBe(false);
          const orderMount = mounts.find(arg =>
            arg.endsWith(':/platform/order')
          );
          stagedOrder = readFileSync(
            `${orderMount!.slice(0, -':/platform/order'.length)}/order.toml`,
            'utf8'
          );
          const envMount = mounts.find(arg => arg.endsWith(':/platform/env'));
          stagedDefaultRailsEnv = readFileSync(
            `${envMount!.slice(0, -':/platform/env'.length)}/BPE_DEFAULT_RAILS_ENV`,
            'utf8'
          );
          stagedRackEnv = readFileSync(
            `${envMount!.slice(0, -':/platform/env'.length)}/BPE_RACK_ENV`,
            'utf8'
          );
          expect(() =>
            readFileSync(
              `${envMount!.slice(0, -':/platform/env'.length)}/VERCEL_OIDC_TOKEN`,
              'utf8'
            )
          ).toThrow();
        }
        return fakeChild('');
      });

      process.env.RACK_ENV = 'fixture-override';
      try {
        await build({
          ...createBuildOptions({
            buildpack: 'ruby',
            command: ['bundle', 'exec', 'puma', '-p', '$PORT'],
          }),
          workPath,
          entrypoint: '<detect>',
          service: { name: 'api' },
          meta: { buildEnv: { BP_MRI_VERSION: '3.3' } },
        } as any);

        expect(stagedProcfile).toBe(`web: bundle exec puma -p '$PORT'\n`);
        // The source tree must stay untouched.
        expect(() => readFileSync(join(workPath, 'Procfile'))).toThrow();
        // Detection is scoped to the descriptor's buildpack group.
        expect(stagedOrder).toContain('id = "paketo-buildpacks/ruby"');
        expect(stagedOrder).toContain('version = "2.0.1"');

        // The app is copied into the working container owned by the
        // builder's build user (as pack does), then the command Procfile is
        // copied on top of it.
        const appCopy = copyCalls.find(args => args.at(-1) === '/workspace');
        expect(appCopy).toBeDefined();
        expect(appCopy).toEqual(
          expect.arrayContaining(['copy', '--chown', '1001:1000'])
        );
        expect(appCopy?.at(-2)).toBe(workPath);
        const procfileCopy = copyCalls.find(
          args => args.at(-1) === '/workspace/Procfile'
        );
        expect(procfileCopy).toEqual(
          expect.arrayContaining(['copy', '--chown', '1001:1000'])
        );
        const callKinds = spawnMock.mock.calls
          .filter(([cmd]) => cmd === 'buildah')
          .map(([, args]) => {
            const a = args as string[];
            if (a.includes('copy')) return 'copy';
            if (a.includes('/cnb/lifecycle/creator')) return 'creator';
            return 'other';
          });
        expect(callKinds.indexOf('copy')).toBeLessThan(
          callKinds.indexOf('creator')
        );

        // Selected build env travels via the CNB platform dir, not the
        // creator process environment.
        const creatorArgs = spawnMock.mock.calls.find(
          ([cmd, args]) =>
            cmd === 'buildah' &&
            (args as string[]).includes('/cnb/lifecycle/creator')
        )?.[1] as string[];
        const platformEnvMount = creatorArgs
          .filter((_arg, index) => creatorArgs[index - 1] === '--volume')
          .find(arg => arg.endsWith(':/platform/env'));
        expect(platformEnvMount).toBeDefined();
        expect(creatorArgs).toContain('-order=/platform/order/order.toml');
        // Overridable production defaults ride along with the user's env.
        expect(stagedDefaultRailsEnv).toBe('production');
        expect(stagedRackEnv).toBe('fixture-override');

        await build({
          ...createBuildOptions({
            buildpack: 'ruby',
            command: 'bundle exec puma -p $PORT',
          }),
          workPath,
          entrypoint: '<detect>',
          service: { name: 'api' },
        } as any);
        expect(stagedProcfile).toBe(`web: bundle exec puma -p $PORT\n`);

        // commandShell + multi-element argv would silently drop every
        // element after the first.
        await expect(
          build({
            ...createBuildOptions({
              buildpack: 'ruby',
              command: ['bundle', 'exec', 'puma'],
              commandShell: true,
            }),
            workPath,
            entrypoint: '<detect>',
            service: { name: 'api' },
          } as any)
        ).rejects.toThrow(/single command string/);
      } finally {
        if (originalRackEnv === undefined) {
          delete process.env.RACK_ENV;
        } else {
          process.env.RACK_ENV = originalRackEnv;
        }
        rmSync(workPath, { recursive: true, force: true });
      }
    });
  });
});

import stripAnsi from 'strip-ansi';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import dev from '../../../../src/commands/dev';
import { TunnelReplacedError } from '../../../../src/util/dev/tunnel/client';
import { TunnelError } from '../../../../src/util/dev/tunnel/errors';
import { client } from '../../../mocks/client';
import { type fs, vol } from 'memfs';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { useProject } from '../../../mocks/project';
import * as linkModule from '../../../../src/util/projects/link';
import { normalize } from 'path';
import output from '../../../../src/output-manager';

const {
  mockStart,
  mockStop,
  mockUpdateEnvValues,
  mockDetectFramework,
  mockReadConfig,
  mockTryDetectServices,
  mockLoadVercelConfig,
  devServerInstances,
  devCommandReady,
  mockedRepoRoots,
  mockStartTunnel,
  mockRefreshOidcToken,
  mockPromptServicesMigration,
} = vi.hoisted(() => ({
  mockStart: vi.fn<() => void>(),
  mockStop: vi.fn<() => Promise<void>>(async () => {}),
  mockUpdateEnvValues: vi.fn<(values: Record<string, string>) => Promise<void>>(
    async () => {}
  ),
  mockDetectFramework: vi.fn<(_options: unknown) => Promise<string | null>>(),
  mockReadConfig: vi.fn<(_dir: string) => Promise<unknown>>(),
  mockTryDetectServices: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mockLoadVercelConfig: vi.fn<(cwd: string) => Promise<unknown>>(),
  devServerInstances: [] as {
    cwd: string;
    projectId?: string;
    orgId?: string;
    projectSettings?: { framework?: string | null };
    queuePort?: number;
    runtimeCachePort?: number;
    schedulesPort?: number;
    routing?: boolean;
    devCommandPort?: number;
    onConfig?: (config: Record<string, unknown>) => void;
  }[],
  // Whether the mocked DevServer's Development Command came up.
  devCommandReady: { value: true },
  mockedRepoRoots: new Map<string, string>(),
  mockStartTunnel: vi.fn<(options: { target: string }) => Promise<unknown>>(),
  mockRefreshOidcToken: vi.fn<(signal: AbortSignal) => AsyncGenerator<string>>(
    async function* () {}
  ),
  mockPromptServicesMigration: vi.fn(async (_options: unknown) => false),
}));

vi.mock('../../../../src/util/services/migrate-experimental-services', () => ({
  promptExperimentalServicesMigration: mockPromptServicesMigration,
}));

vi.mock('../../../../src/util/dev/tunnel/start', () => ({
  startTunnel: mockStartTunnel,
}));

vi.mock('../../../../src/util/env/refresh-oidc-token', () => ({
  refreshOidcToken: mockRefreshOidcToken,
}));

vi.mock('../../../../src/util/is-vercelian', () => ({
  isVercelian: async () => true,
  isVercelianFromLoadedTeams: () => false,
}));

vi.mock('@vercel/fs-detectors', async () => {
  const actual = await vi.importActual<typeof import('@vercel/fs-detectors')>(
    '@vercel/fs-detectors'
  );
  return {
    ...actual,
    detectFramework: mockDetectFramework,
  };
});

// Delegates to the real implementation unless a test queues a resolved
// services result (see `mockResolvedValueOnce` in the buildpack tests).
vi.mock('../../../../src/util/projects/detect-services', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/util/projects/detect-services')
  >('../../../../src/util/projects/detect-services');
  mockTryDetectServices.mockImplementation(
    actual.tryDetectServices as (...args: unknown[]) => Promise<unknown>
  );
  mockLoadVercelConfig.mockImplementation(actual.loadVercelConfig);
  return {
    ...actual,
    tryDetectServices: mockTryDetectServices,
    loadVercelConfig: mockLoadVercelConfig,
  };
});

vi.mock('../../../../src/util/config/read-config', () => ({
  default: mockReadConfig,
}));

vi.mock('../../../../src/util/dev/server', () => {
  class DevServer {
    devCommand = 'framework dev';
    private port?: number;
    constructor(
      cwd: string,
      options: {
        projectId?: string;
        orgId?: string;
        projectSettings?: { framework?: string | null };
        queuePort?: number;
        runtimeCachePort?: number;
        schedulesPort?: number;
        routing?: boolean;
        devCommandPort?: number;
        onConfig?: (config: Record<string, unknown>) => void;
      }
    ) {
      this.port = options.devCommandPort;
      devServerInstances.push({
        cwd,
        projectId: options.projectId,
        orgId: options.orgId,
        projectSettings: options.projectSettings,
        queuePort: options.queuePort,
        runtimeCachePort: options.runtimeCachePort,
        schedulesPort: options.schedulesPort,
        routing: options.routing,
        devCommandPort: options.devCommandPort,
        onConfig: options.onConfig,
      });
    }
    get devCommandOrigin() {
      return devCommandReady.value
        ? `http://127.0.0.1:${this.port ?? 4321}`
        : undefined;
    }
    feed() {}
    stop = mockStop;
    start = mockStart;
    updateEnvValues = mockUpdateEnvValues;
  }
  return {
    default: DevServer,
  };
});

// `findRepoRoot` uses `git rev-parse` and real filesystem lookups that
// don't work against memfs in tests. Replace it with a lookup against
// `mockedRepoRoots`: for each `cwd` we look up the longest registered
// path that contains it (the same nearest-ancestor semantics findRepoRoot
// provides via `.git` traversal). Paths are normalized to forward slashes
// before comparison so the mock works on Windows, where `path.resolve`
// converts forward slashes to backslashes.
vi.mock('../../../../src/util/link/repo', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/util/link/repo')
  >('../../../../src/util/link/repo');
  const toPosix = (p: string) => p.replace(/\\/g, '/');
  return {
    ...actual,
    findRepoRoot: async (start: string) => {
      const normStart = toPosix(start);
      let best: string | undefined;
      for (const root of mockedRepoRoots.keys()) {
        const normRoot = toPosix(root);
        if (normStart === normRoot || normStart.startsWith(`${normRoot}/`)) {
          if (!best || root.length > best.length) {
            best = root;
          }
        }
      }
      return best;
    },
  };
});

vi.mock('node:fs/promises', async () => {
  const memfs: { fs: typeof fs } = await vi.importActual('memfs');
  return memfs.fs.promises;
});

vi.mock('node:fs', async () => {
  const memfs: { fs: typeof fs } = await vi.importActual('memfs');
  return memfs;
});

afterEach(() => {
  // __VERCEL_DEV_RUNNING is set when `vercel dev` runs to act as a lock.
  // It's unset as a side effect of  the process exiting. This won't work under test
  // where `vercel dev` can be invoked several times in a row.
  vi.stubEnv('__VERCEL_DEV_RUNNING', undefined);
  vol.reset();
  devServerInstances.length = 0;
  mockedRepoRoots.clear();
});

describe('dev', () => {
  const projectId = 'prj_whatever123';
  const orgId = 'team_123';
  const projectName = 'project-name';
  const projectPath = `/user/name/code/${projectName}`;
  // What the mocked API serves for the linked project.
  let linkedProject: Parameters<typeof useProject>[0];

  beforeEach(async () => {
    // Drop any queued `mockResolvedValueOnce` a failed test left behind.
    const actual = await vi.importActual<
      typeof import('../../../../src/util/projects/detect-services')
    >('../../../../src/util/projects/detect-services');
    mockLoadVercelConfig.mockReset();
    mockLoadVercelConfig.mockImplementation(actual.loadVercelConfig);
    mockDetectFramework.mockReset();
    mockDetectFramework.mockResolvedValue(null);
    mockReadConfig.mockReset();
    mockReadConfig.mockResolvedValue(null);
    useUser();
    useTeams(orgId);
    linkedProject = {
      id: projectId,
      name: projectName,
    };
    useProject(linkedProject);

    const json = {
      '.vercel/project.json': JSON.stringify({
        projectId,
        orgId,
      }),
    };
    vol.fromJSON(json, projectPath);
  });

  describe('--tunnel', () => {
    let exit: MockInstance<typeof process.exit>;
    beforeEach(() => {
      Object.assign(linkedProject!, {
        ssoProtection: { deploymentType: 'all_except_custom_domains' },
      });
      devCommandReady.value = true;
      mockStart.mockClear();
      mockStop.mockClear();
      mockStartTunnel.mockReset();
      exit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
    });
    afterEach(() => {
      exit.mockRestore();
    });

    // Calls the SIGINT handlers dev installed, not vitest's own.
    const interrupt = (before: unknown[]) => {
      for (const listener of process.listeners('SIGINT')) {
        if (!before.includes(listener)) (listener as () => void)();
      }
    };
    const running = (url: string, done: Promise<void>) => {
      done.catch(() => {});
      return {
        url,
        done,
        close: vi.fn(),
        setRoutes: vi.fn(async (_routes: unknown) => url),
        release: vi.fn(async () => {}),
      };
    };

    it("refuses when the project's previews aren't protected", async () => {
      delete (linkedProject as { ssoProtection?: unknown }).ssoProtection;

      client.setArgv('dev', '--tunnel', projectPath);
      await expect(dev(client)).resolves.toEqual(1);

      await expect(client.stderr).toOutput('needs Deployment Protection');
      expect(devServerInstances).toHaveLength(0);
      expect(mockStartTunnel).not.toHaveBeenCalled();
    });

    it('names the tunnel with --tunnel=<label>', async () => {
      mockStartTunnel.mockReturnValueOnce(new Promise(() => {}));

      client.setArgv('dev', '--tunnel=demo', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await vi.waitFor(() => expect(mockStartTunnel).toHaveBeenCalled());

      expect(mockStartTunnel).toHaveBeenCalledWith(
        expect.objectContaining({ aliasLabel: 'demo' })
      );
      interrupt(before);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    });

    it("releases a --tunnel name's lease on Ctrl-C", async () => {
      const tunnel = running('https://demo.vercel.app', new Promise(() => {}));
      mockStartTunnel.mockResolvedValueOnce(tunnel);

      client.setArgv('dev', '--tunnel=demo', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await expect(client.stderr).toOutput(
        'Tunnel available at https://demo.vercel.app'
      );
      interrupt(before);

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
      expect(tunnel.release).toHaveBeenCalled();
    });

    it('releases the lease before stopping the dev server', async () => {
      const steps: string[] = [];
      const tunnel = running('https://demo.vercel.app', new Promise(() => {}));
      tunnel.release.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        steps.push('released');
      });
      mockStop.mockImplementationOnce(async () => {
        steps.push('stopped');
      });
      mockStartTunnel.mockResolvedValueOnce(tunnel);

      client.setArgv('dev', '--tunnel=demo', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await expect(client.stderr).toOutput(
        'Tunnel available at https://demo.vercel.app'
      );
      interrupt(before);

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
      expect(steps).toEqual(['released', 'stopped']);
    });

    it("refuses a --tunnel name that can't be a URL's first label", async () => {
      client.setArgv('dev', '--tunnel=My_Demo', projectPath);

      await expect(dev(client)).resolves.toEqual(2);
      await expect(client.stderr).toOutput(
        "Can't use `vercel dev --tunnel=My_Demo`. A tunnel's name is a DNS label.\n  Use lowercase letters, digits and hyphens"
      );
      expect(devServerInstances).toHaveLength(0);
    });

    it('runs the app as vc dev does, without the router, on the --listen port', async () => {
      mockStartTunnel.mockResolvedValueOnce(
        running('https://one.vercel.app', new Promise(() => {}))
      );

      client.setArgv('dev', '--tunnel', '--listen', '3123', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await expect(client.stderr).toOutput(
        'Tunnel available at https://one.vercel.app'
      );

      expect(devServerInstances[0]).toMatchObject({
        projectId,
        orgId,
        routing: false,
        devCommandPort: 3123,
      });
      expect(mockStart).toHaveBeenCalled();
      expect(mockStartTunnel).toHaveBeenCalledWith(
        expect.objectContaining({ target: 'http://127.0.0.1:3123', routes: [] })
      );
      interrupt(before);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
      expect(mockStop).toHaveBeenCalled();
    });

    it('picks a free port for --listen 0', async () => {
      mockStartTunnel.mockReturnValueOnce(new Promise(() => {}));

      client.setArgv('dev', '--tunnel', '--listen', '0', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await vi.waitFor(() => expect(mockStartTunnel).toHaveBeenCalled());

      expect(devServerInstances[0].devCommandPort).toBeGreaterThan(0);
      interrupt(before);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    });

    it('treats Ctrl-C while the tunnel connects as a cancel', async () => {
      mockStartTunnel.mockReturnValueOnce(new Promise(() => {}));

      client.setArgv('dev', '--tunnel', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await vi.waitFor(() => expect(mockStartTunnel).toHaveBeenCalled());
      interrupt(before);

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
      expect(mockStop).toHaveBeenCalled();
      expect(client.stderr.getFullOutput()).not.toContain('Error');
    });

    it("doesn't announce a tunnel that starts after Ctrl-C", async () => {
      let started!: (tunnel: ReturnType<typeof running>) => void;
      mockStartTunnel.mockReturnValueOnce(
        new Promise(resolve => {
          started = resolve;
        })
      );
      let stopped!: () => void;
      mockStop.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            stopped = resolve;
          })
      );

      client.setArgv('dev', '--tunnel', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await vi.waitFor(() => expect(mockStartTunnel).toHaveBeenCalled());
      interrupt(before);
      await vi.waitFor(() => expect(mockStop).toHaveBeenCalled());
      // The proxy lookup finishes while the dev server is still stopping.
      const tunnel = running('https://one.vercel.app', new Promise(() => {}));
      started(tunnel);
      await vi.waitFor(() => expect(tunnel.close).toHaveBeenCalled());
      stopped();

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
      expect(client.stderr.getFullOutput()).not.toContain('Tunnel available');
    });

    it('deploys the proxy again when the tunnel is replaced', async () => {
      mockStartTunnel
        .mockResolvedValueOnce(
          running(
            'https://one.vercel.app',
            Promise.reject(new TunnelReplacedError())
          )
        )
        .mockResolvedValueOnce(
          running('https://two.vercel.app', new Promise(() => {}))
        );

      client.setArgv('dev', '--tunnel', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await expect(client.stderr).toOutput(
        'Tunnel available at https://two.vercel.app'
      );
      interrupt(before);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    });

    it('starts a replaced tunnel again as resumed, so a taken alias falls back', async () => {
      mockStartTunnel
        .mockResolvedValueOnce(
          running(
            'https://one.vercel.app',
            Promise.reject(new TunnelReplacedError())
          )
        )
        .mockResolvedValueOnce(
          running('https://two.vercel.app', new Promise(() => {}))
        );

      client.setArgv('dev', '--tunnel=demo', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await vi.waitFor(() => expect(mockStartTunnel).toHaveBeenCalledTimes(2));

      expect(mockStartTunnel.mock.calls.map(([options]) => options)).toEqual([
        expect.objectContaining({ aliasLabel: 'demo', resumed: false }),
        expect.objectContaining({ aliasLabel: 'demo', resumed: true }),
      ]);
      interrupt(before);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    });

    it("deploys the proxy again when the project's routes change", async () => {
      const tunnel = running('https://one.vercel.app', new Promise(() => {}));
      mockStartTunnel.mockResolvedValueOnce(tunnel);

      client.setArgv('dev', '--tunnel', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await expect(client.stderr).toOutput(
        'Tunnel available at https://one.vercel.app'
      );
      tunnel.setRoutes.mockResolvedValueOnce('https://two.vercel.app');
      devServerInstances[0].onConfig?.({
        redirects: [{ source: '/r', destination: '/t', permanent: false }],
      });

      await expect(client.stderr).toOutput(
        'Tunnel available at https://two.vercel.app'
      );
      expect(tunnel.setRoutes).toHaveBeenLastCalledWith([
        { src: '^/r$', headers: { Location: '/t' }, status: 307 },
      ]);
      interrupt(before);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    });

    it("keeps the dev server up while a replaced tunnel can't come back", async () => {
      mockStartTunnel
        .mockResolvedValueOnce(
          running(
            'https://one.vercel.app',
            Promise.reject(new TunnelReplacedError())
          )
        )
        .mockRejectedValueOnce(
          new TunnelError('Failed to deploy the tunnel proxy.', {
            remote: { source: 'Deployment', message: 'Build failed' },
            inspectorUrl: 'https://i/dpl_x',
          })
        )
        .mockResolvedValueOnce(
          running('https://two.vercel.app', new Promise(() => {}))
        );

      client.setArgv('dev', '--tunnel', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await expect(client.stderr).toOutput(
        "Couldn't bring the tunnel back. Failed to deploy the tunnel proxy. Trying again in 1s.\n  Deployment: Build failed\n  \n  Inspect the deployment:\n    https://i/dpl_x"
      );
      await expect(client.stderr).toOutput(
        'Tunnel available at https://two.vercel.app'
      );
      expect(mockStop).not.toHaveBeenCalled();
      expect(mockStartTunnel).toHaveBeenLastCalledWith(
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      interrupt(before);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    });

    it('stops trying to bring the tunnel back on Ctrl-C', async () => {
      mockStartTunnel
        .mockResolvedValueOnce(
          running(
            'https://one.vercel.app',
            Promise.reject(new TunnelReplacedError())
          )
        )
        .mockRejectedValue(new Error('The proxy deployment failed'));

      client.setArgv('dev', '--tunnel', projectPath);
      const before = process.listeners('SIGINT');
      void dev(client);
      await expect(client.stderr).toOutput(
        "Couldn't bring the tunnel back. Trying again in 1s.\n  Reason: The proxy deployment failed"
      );
      interrupt(before);

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(mockStartTunnel).toHaveBeenCalledTimes(2);
    });

    it("stops vc dev when the tunnel can't start at all", async () => {
      mockStartTunnel.mockRejectedValueOnce(
        new TunnelError("The tunnel service didn't allow this tunnel.", {
          remote: { source: 'Tunnel service', message: 'not allowed' },
        })
      );

      client.setArgv('dev', '--tunnel', projectPath);
      await expect(dev(client)).resolves.toEqual(1);

      await expect(client.stderr).toOutput(
        "The tunnel service didn't allow this tunnel.\n  Tunnel service: not allowed"
      );
      expect(mockStartTunnel).toHaveBeenCalledTimes(1);
      expect(mockStop).toHaveBeenCalled();
    });

    it('stops the dev server when the service ends the tunnel', async () => {
      mockStartTunnel.mockResolvedValueOnce(
        running(
          'https://one.vercel.app',
          Promise.reject(
            new TunnelError("The tunnel service didn't allow this tunnel.", {
              remote: {
                source: 'Tunnel service',
                message: '\u001b[31mnot allowed\u001b[0m\n\u202Eby policy',
              },
            })
          )
        )
      );

      client.setArgv('dev', '--tunnel', projectPath);
      await expect(dev(client)).resolves.toEqual(1);

      // The service's words stay out of the headline, stripped onto one row.
      await expect(client.stderr).toOutput(
        "The tunnel service didn't allow this tunnel. Stopped the dev server.\n  Tunnel service: not allowed\\nby policy\n"
      );
      expect(mockStop).toHaveBeenCalled();
    });

    it('needs a Development Command', async () => {
      devCommandReady.value = false;

      client.setArgv('dev', '--tunnel', projectPath);
      await expect(dev(client)).resolves.toEqual(1);

      await expect(client.stderr).toOutput('requires a Development Command');
      expect(mockStartTunnel).not.toHaveBeenCalled();
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dev';

      client.setArgv(command, '--help');
      const exitCodePromise = dev(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('[dir]', () => {
    it('tracks the dir if supplied', async () => {
      client.setArgv('dev', projectPath);
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:dir',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--listen', () => {
    it('tracks the listen option if supplied', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--listen=9090');
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:listen',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('OIDC token refresh', () => {
    it('hands the dev server tokens refreshed after startup', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);
      let refresh!: () => void;
      const refreshed = new Promise<void>(resolve => {
        refresh = resolve;
      });
      mockRefreshOidcToken.mockImplementationOnce(async function* (signal) {
        await refreshed;
        if (!signal.aborted) yield 'refreshed';
      });
      client.setArgv('dev');

      await expect(dev(client)).resolves.toEqual(undefined);
      refresh();

      await vi.waitFor(() =>
        expect(mockUpdateEnvValues).toHaveBeenCalledWith({
          VERCEL_OIDC_TOKEN: 'refreshed',
        })
      );
    });
  });

  describe('resource ports', () => {
    it.each([
      ['--queue-port', 'queuePort', 'option:queue-port'],
      ['--runtime-cache-port', 'runtimeCachePort', 'option:runtime-cache-port'],
      ['--schedules-port', 'schedulesPort', 'option:schedules-port'],
    ] as const)('passes and tracks %s', async (flag, field, telemetryKey) => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);
      client.setArgv('dev', `${flag}=5782`);

      await expect(dev(client)).resolves.toEqual(undefined);

      expect(devServerInstances[0][field]).toBe(5782);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: telemetryKey,
          value: '[REDACTED]',
        },
      ]);
    });

    it.each([
      ['--queue-port', 'queuePort'],
      ['--schedules-port', 'schedulesPort'],
    ] as const)('accepts %s 0 for OS allocation', async (flag, field) => {
      client.setArgv('dev', `${flag}=0`, projectPath);

      await expect(dev(client)).resolves.toEqual(undefined);

      expect(devServerInstances[0][field]).toBe(0);
    });

    it.each([
      '-1',
      '1.5',
      '65536',
      'abc',
    ])('rejects invalid resource port %s', async port => {
      client.setArgv('dev', `--queue-port=${port}`, projectPath);

      await expect(dev(client)).resolves.toBe(1);
      await expect(client.stderr).toOutput(
        '--queue-port must be an integer between 0 and 65535'
      );
    });

    it('rejects the same pinned port for both resources', async () => {
      client.setArgv(
        'dev',
        '--queue-port=5782',
        '--runtime-cache-port=5782',
        projectPath
      );

      await expect(dev(client)).resolves.toBe(1);
      await expect(client.stderr).toOutput(
        '--queue-port and --runtime-cache-port must use different ports'
      );
    });

    it.each([
      '-1',
      '1.5',
      '65536',
      'abc',
      '',
    ])('rejects invalid schedules port %s', async port => {
      client.setArgv('dev', `--schedules-port=${port}`, projectPath);
      await expect(dev(client)).resolves.toBe(1);
      await expect(client.stderr).toOutput(
        '--schedules-port must be an integer between 0 and 65535'
      );
      expect(devServerInstances).toHaveLength(0);
    });

    it.each([
      '--queue-port',
      '--runtime-cache-port',
    ])('rejects a schedules port shared with %s', async flag => {
      client.setArgv(
        'dev',
        `${flag}=5784`,
        '--schedules-port=5784',
        projectPath
      );
      await expect(dev(client)).resolves.toBe(1);
      await expect(client.stderr).toOutput(
        `${flag} and --schedules-port must use different ports`
      );
    });

    it('includes the schedules port and default in help', async () => {
      const print = vi.spyOn(output, 'print');
      client.setArgv('dev', '--help');
      await expect(dev(client)).resolves.toBe(0);
      expect(stripAnsi(print.mock.calls.flat().join(''))).toMatch(
        /--schedules-port <PORT>\s+Specify the local Vercel Schedules server port\s+\(default:\s+4784\)/
      );
      expect(stripAnsi(print.mock.calls.flat().join(''))).not.toContain(
        '[4784]'
      );
    });
  });

  describe('--yes', () => {
    it('tracks the listen option if supplied', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--yes');
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--port', () => {
    it('tracks the listen option if supplied', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--port=9090');
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:port',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--confirm', () => {
    it('tracks the listen option if supplied', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--confirm');
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:confirm',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--local', () => {
    it('shows warning message and starts dev server for unlinked project', async () => {
      const unlinkedPath = '/user/name/code/unlinked-project';
      vol.fromJSON({}, unlinkedPath);

      client.setArgv('dev', '--local', unlinkedPath);
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
      await expect(client.stderr).toOutput('Running dev server in local mode');
    });

    it.each([
      {
        framework: 'vite',
        files: {
          'package.json': JSON.stringify({
            devDependencies: { vite: '7.0.0' },
          }),
        },
      },
      {
        framework: 'go',
        files: {
          'package.json': '{}',
          'go.mod': 'module example.com/local-dev',
          'main.go': 'package main',
        },
      },
    ])('detects the $framework framework for an unlinked zero-config project', async ({
      framework,
      files,
    }) => {
      const unlinkedPath = `/user/name/code/unlinked-${framework}-project`;
      vol.fromJSON(files as Record<string, string>, unlinkedPath);
      mockDetectFramework.mockResolvedValueOnce(framework);

      client.setArgv('dev', '--local', unlinkedPath);
      await expect(dev(client)).resolves.toEqual(undefined);

      expect(mockDetectFramework).toHaveBeenCalledOnce();
      expect(devServerInstances).toHaveLength(1);
      expect(devServerInstances[0].projectSettings).toEqual({ framework });
    });

    it('does not detect a framework when explicit builds are configured', async () => {
      const unlinkedPath = '/user/name/code/unlinked-explicit-builds';
      vol.fromJSON(
        {
          'package.json': JSON.stringify({
            devDependencies: { umi: '4.0.0' },
          }),
          'vercel.json': JSON.stringify({
            builds: [{ src: 'package.json', use: '@vercel/static-build' }],
          }),
        },
        unlinkedPath
      );
      mockDetectFramework.mockResolvedValueOnce('umijs');
      mockReadConfig.mockResolvedValueOnce({
        builds: [{ src: 'package.json', use: '@vercel/static-build' }],
      });

      client.setArgv('dev', '--local', unlinkedPath);
      await expect(dev(client)).resolves.toEqual(undefined);

      expect(mockDetectFramework).not.toHaveBeenCalled();
      expect(devServerInstances[0].projectSettings).toBeUndefined();
    });

    it('does not detect a framework when local config explicitly disables it', async () => {
      const unlinkedPath = '/user/name/code/unlinked-other-framework';
      vol.fromJSON(
        {
          'package.json': '{}',
          'vercel.json': JSON.stringify({ framework: null }),
        },
        unlinkedPath
      );
      mockDetectFramework.mockResolvedValueOnce('vite');
      mockReadConfig.mockResolvedValueOnce({ framework: null });

      client.setArgv('dev', '--local', unlinkedPath);
      await expect(dev(client)).resolves.toEqual(undefined);

      expect(mockDetectFramework).not.toHaveBeenCalled();
      expect(devServerInstances[0].projectSettings).toBeUndefined();
    });

    it('leaves configured services on the services detection path', async () => {
      const unlinkedPath = '/user/name/code/unlinked-services-project';
      vol.fromJSON({ 'package.json': '{}' }, unlinkedPath);
      mockDetectFramework.mockResolvedValueOnce('vite');
      mockReadConfig.mockResolvedValueOnce({ services: {} });

      client.setArgv('dev', '--local', unlinkedPath);
      await expect(dev(client)).resolves.toEqual(undefined);

      expect(mockDetectFramework).not.toHaveBeenCalled();
      expect(devServerInstances[0].projectSettings).toBeUndefined();
    });

    describe('daemons', () => {
      const daemonPath = '/user/name/code/daemon-project';
      const heartbeat = {
        root: 'daemon',
        entrypoint: 'Dockerfile',
        instances: { sfo1: 1 },
      };
      const daemonWarning =
        "`vercel dev` doesn't run daemons: heartbeat. Run them with Docker.";

      it('warns and runs a regular app alongside daemons', async () => {
        vol.fromJSON({ 'package.json': '{}' }, daemonPath);
        mockDetectFramework.mockResolvedValueOnce('vite');
        mockReadConfig.mockResolvedValueOnce({ daemons: { heartbeat } });

        client.setArgv('dev', '--local', daemonPath);
        await expect(dev(client)).resolves.toEqual(undefined);
        await expect(client.stderr).toOutput(daemonWarning);
        expect(mockDetectFramework).toHaveBeenCalled();
        expect(devServerInstances).toHaveLength(1);
        expect(devServerInstances[0].projectSettings?.framework).toBe('vite');
      });

      it('warns and runs services alongside daemons', async () => {
        vol.fromJSON({ 'package.json': '{}' }, daemonPath);
        mockReadConfig.mockResolvedValueOnce({
          services: { web: { root: '.' } },
          daemons: { heartbeat },
        });

        client.setArgv('dev', '--local', daemonPath);
        await expect(dev(client)).resolves.toEqual(undefined);
        await expect(client.stderr).toOutput(daemonWarning);
        expect(devServerInstances).toHaveLength(1);
      });

      it('does not warn without daemons', async () => {
        vol.fromJSON({ 'package.json': '{}' }, daemonPath);
        mockReadConfig.mockResolvedValueOnce({ daemons: {} });

        client.setArgv('dev', '--local', daemonPath);
        await expect(dev(client)).resolves.toEqual(undefined);
        expect(client.stderr.getFullOutput()).not.toContain('daemons');
        expect(devServerInstances).toHaveLength(1);
      });
    });

    it('does not show local mode warning for linked projects', async () => {
      mockDetectFramework.mockResolvedValueOnce('vite');
      client.setArgv('dev', '--local', projectPath);
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(mockDetectFramework).not.toHaveBeenCalled();
      await expect(client.stderr).not.toOutput(
        'Running dev server in local mode',
        100
      );
    });

    it('tracks telemetry', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--local');
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:local',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('buildpack-backed services', () => {
    beforeEach(() => {
      mockStart.mockClear();
    });

    const rubyService = (extra: Record<string, unknown> = {}) => ({
      schema: 'experimentalServicesV2',
      name: 'red',
      root: 'services/red',
      framework: 'ruby',
      runtime: 'ruby',
      builder: {
        use: '@vercel/container',
        src: 'services/red/<detect>',
        config: { zeroConfig: true, framework: 'ruby', buildpack: 'ruby' },
      },
      ...extra,
    });

    it('fails before starting the dev server when a service builds with a buildpack', async () => {
      mockTryDetectServices.mockResolvedValueOnce({
        services: [rubyService(), rubyService({ name: 'blue' })],
        useImplicitEnvInjection: false,
        errors: [],
        warnings: [],
      });

      client.setArgv('dev', projectPath);
      await expect(dev(client)).resolves.toEqual(1);

      await expect(client.stderr).toOutput(
        'Error: [BUILDPACK_DEV_UNSUPPORTED] `vercel dev` doesn\'t support the Ruby services "red" and "blue" yet.'
      );
      expect(
        client.stderr
          .getFullOutput()
          .replace('[BUILDPACK_DEV_UNSUPPORTED] ', '')
      ).not.toMatch(/buildpack|bundle exec|rackup|prebuilt|devCommand/i);
      expect(devServerInstances).toHaveLength(0);
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('fails even when every buildpack service has a devCommand', async () => {
      mockTryDetectServices.mockResolvedValueOnce({
        services: [rubyService({ devCommand: 'bundle exec rackup -p $PORT' })],
        useImplicitEnvInjection: false,
        errors: [],
        warnings: [],
      });

      client.setArgv('dev', projectPath);
      await expect(dev(client)).resolves.toEqual(1);

      await expect(client.stderr).toOutput(
        'Error: [BUILDPACK_DEV_UNSUPPORTED] `vercel dev` doesn\'t support the Ruby service "red" yet.'
      );
      expect(devServerInstances).toHaveLength(0);
      expect(mockStart).not.toHaveBeenCalled();
    });
  });

  describe('dev command failure', () => {
    let exitSpy: MockInstance<typeof process.exit>;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
        code?: number
      ) => {
        throw new Error(`__exit__:${code ?? ''}`);
      }) as never);
    });

    afterEach(() => {
      exitSpy.mockRestore();
      mockStart.mockReset();
    });

    it('prints error and exits with the dev command exit code', async () => {
      const { DevCommandExitError } = await import(
        '../../../../src/util/dev/diagnostics'
      );

      mockStart.mockRejectedValueOnce(
        new DevCommandExitError(
          'Dev Command “framework dev” exited with code 127',
          127
        )
      );

      client.setArgv('dev', projectPath);

      await expect(dev(client)).rejects.toThrow('__exit__:127');
      await expect(client.stderr).toOutput(
        'Error: [DEV_COMMAND_EXITED] Dev Command “framework dev” exited with code 127'
      );
    });

    it('exits with code 1 on ServiceStartError', async () => {
      const { ServiceStartError } = await import(
        '../../../../src/util/dev/diagnostics'
      );

      mockStart.mockRejectedValueOnce(
        new ServiceStartError([
          new Error('Service "frontend" exited with code 127'),
        ])
      );

      client.setArgv('dev', projectPath);

      await expect(dev(client)).rejects.toThrow('__exit__:1');
      await expect(client.stderr).toOutput(
        'Service "frontend" exited with code 127'
      );
    });
  });

  describe('rootDirectory', () => {
    // Reproduces a bug where running `vercel dev` from inside a project
    // subdirectory whose name matches the project's `rootDirectory`
    // setting caused the CLI to append `rootDirectory` again, producing
    // a non-existent path like `monorepo/project1/project1`. After the
    // fix, `rootDirectory` is interpreted relative to the resolved repo
    // root rather than the user's current directory.
    it('resolves rootDirectory relative to repo root, not cwd', async () => {
      const monorepoProjectId = 'prj_monorepo123';
      const monorepoProjectName = 'monorepo-project';
      const subdir = 'web';
      const monorepoRoot = `/user/name/code/my-monorepo`;
      const projectDir = `${monorepoRoot}/${subdir}`;

      mockedRepoRoots.set(monorepoRoot, monorepoRoot);

      useProject({
        id: monorepoProjectId,
        name: monorepoProjectName,
        rootDirectory: subdir,
      });

      vol.reset();
      vol.fromJSON(
        {
          [`${projectDir}/.vercel/project.json`]: JSON.stringify({
            projectId: monorepoProjectId,
            orgId,
          }),
        },
        '/'
      );

      client.setArgv('dev', projectDir);
      const exitCodePromise = dev(client);
      await expect(exitCodePromise).resolves.toEqual(undefined);

      expect(devServerInstances).toHaveLength(1);
      // Normalize separators so the assertion holds on Windows, where
      // `path.join` produces backslashes.
      expect(devServerInstances[0].cwd.replace(/\\/g, '/')).toBe(projectDir);
    });

    // Edge case: the monorepo folder name happens to match the project's
    // rootDirectory. e.g. the monorepo is at `/some/path/project-awesome`
    // and contains a subproject at `/some/path/project-awesome/project-awesome`.
    // A pure path-based heuristic would incorrectly skip the join here; the
    // fix uses the repo root so the project path is computed correctly.
    it('handles a monorepo folder name that matches rootDirectory', async () => {
      const matchingProjectId = 'prj_matching123';
      const matchingProjectName = 'matching-name-project';
      const name = 'project-awesome';
      const monorepoRoot = `/some/path/${name}`;
      const projectDir = `${monorepoRoot}/${name}`;

      mockedRepoRoots.set(monorepoRoot, monorepoRoot);

      useProject({
        id: matchingProjectId,
        name: matchingProjectName,
        rootDirectory: name,
      });

      vol.reset();
      vol.fromJSON(
        {
          [`${monorepoRoot}/.vercel/project.json`]: JSON.stringify({
            projectId: matchingProjectId,
            orgId,
          }),
        },
        '/'
      );

      client.setArgv('dev', monorepoRoot);
      const exitCodePromise = dev(client);
      await expect(exitCodePromise).resolves.toEqual(undefined);

      expect(devServerInstances).toHaveLength(1);
      // Normalize separators so the assertion holds on Windows, where
      // `path.join` produces backslashes.
      expect(devServerInstances[0].cwd.replace(/\\/g, '/')).toBe(projectDir);
    });

    it('warns about daemons in the linked rootDirectory from the repo root', async () => {
      const daemonProjectId = 'prj_daemon123';
      const monorepoRoot = '/user/name/code/daemon-monorepo';
      const appDir = `${monorepoRoot}/app`;
      mockedRepoRoots.set(monorepoRoot, monorepoRoot);
      useProject({
        id: daemonProjectId,
        name: 'daemon-project',
        rootDirectory: 'app',
      });
      vol.reset();
      vol.fromJSON(
        {
          [`${monorepoRoot}/.vercel/project.json`]: JSON.stringify({
            projectId: daemonProjectId,
            orgId,
          }),
        },
        '/'
      );
      // Only the resolved `app` directory declares the daemon; `readConfig`
      // resolves null for the repo root `vercel dev` runs from.
      mockLoadVercelConfig.mockResolvedValueOnce({
        daemons: {
          heartbeat: {
            root: 'daemon',
            entrypoint: 'Dockerfile',
            instances: { sfo1: 1 },
          },
        },
      });

      client.setArgv('dev', monorepoRoot);
      await expect(dev(client)).resolves.toEqual(undefined);
      await expect(client.stderr).toOutput(
        "`vercel dev` doesn't run daemons: heartbeat. Run them with Docker."
      );
      expect(
        String(mockLoadVercelConfig.mock.lastCall?.[0]).replace(/\\/g, '/')
      ).toBe(appDir);
      expect(devServerInstances).toHaveLength(1);
      expect(devServerInstances[0].cwd.replace(/\\/g, '/')).toBe(appDir);
    });

    it('takes the --local-config file over the linked rootDirectory config', async () => {
      const daemonProjectId = 'prj_daemon123';
      const monorepoRoot = '/user/name/code/daemon-monorepo';
      mockedRepoRoots.set(monorepoRoot, monorepoRoot);
      useProject({
        id: daemonProjectId,
        name: 'daemon-project',
        rootDirectory: 'app',
      });
      vol.reset();
      vol.fromJSON(
        {
          [`${monorepoRoot}/.vercel/project.json`]: JSON.stringify({
            projectId: daemonProjectId,
            orgId,
          }),
        },
        '/'
      );
      // `readConfig` reads the --local-config file.
      mockReadConfig.mockResolvedValueOnce({
        daemons: {
          worker: {
            root: 'worker',
            entrypoint: 'Dockerfile',
            instances: { sfo1: 1 },
          },
        },
      });
      client.localConfigPath = 'vercel.dev.json';

      client.setArgv('dev', monorepoRoot);
      await expect(dev(client)).resolves.toEqual(undefined);
      await expect(client.stderr).toOutput(
        "`vercel dev` doesn't run daemons: worker. Run them with Docker."
      );
      expect(mockLoadVercelConfig).not.toHaveBeenCalled();
    });

    it("doesn't migrate the project's own config with --local-config", async () => {
      mockPromptServicesMigration.mockClear();
      client.localConfigPath = 'vercel.dev.json';

      client.setArgv('dev', '--yes', projectPath);
      await expect(dev(client)).resolves.toEqual(undefined);
      expect(mockPromptServicesMigration).not.toHaveBeenCalled();
    });

    it("offers to migrate the project's own config without --local-config", async () => {
      mockPromptServicesMigration.mockClear();

      client.setArgv('dev', '--yes', projectPath);
      await expect(dev(client)).resolves.toEqual(undefined);
      expect(mockPromptServicesMigration).toHaveBeenCalled();
    });
  });

  describe('project/org IDs', () => {
    it('passes the linked project and org IDs to DevServer', async () => {
      const getLinkedProjectSpy = vi.spyOn(linkModule, 'getLinkedProject');
      client.setArgv('dev', projectPath);
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(devServerInstances).toHaveLength(1);
      expect(devServerInstances[0]).toMatchObject({ projectId, orgId });
      expect(getLinkedProjectSpy).toHaveBeenCalledWith(client, {
        cwd: normalize(projectPath),
        projectName: undefined,
        projectNameIsExplicit: false,
        scopeIsExplicit: false,
      });
      getLinkedProjectSpy.mockRestore();
    });

    it('omits runtime-only project fields from DevServer projectSettings', async () => {
      const settingsProjectId = 'prj_settings123';
      const settingsProjectName = 'settings-project';
      const settingsProjectPath = `/user/name/code/${settingsProjectName}`;

      useProject({
        id: settingsProjectId,
        name: settingsProjectName,
        framework: 'nextjs',
        env: [
          {
            key: 'BRANCH_SECRET',
            value: 'x'.repeat(1024),
          },
        ],
        latestDeployments: [{ id: 'dpl_test' }],
      } as Parameters<typeof useProject>[0]);

      vol.fromJSON(
        {
          '.vercel/project.json': JSON.stringify({
            projectId: settingsProjectId,
            orgId,
          }),
        },
        settingsProjectPath
      );

      client.setArgv('dev', settingsProjectPath);
      await expect(dev(client)).resolves.toEqual(undefined);

      expect(devServerInstances).toHaveLength(1);
      expect(devServerInstances[0].projectSettings).toMatchObject({
        framework: 'nextjs',
      });
      expect(devServerInstances[0].projectSettings).not.toHaveProperty('env');
      expect(devServerInstances[0].projectSettings).not.toHaveProperty(
        'latestDeployments'
      );
    });

    it('omits the IDs for unlinked projects in --local mode', async () => {
      const unlinkedPath = '/user/name/code/unlinked-project';
      vol.fromJSON({}, unlinkedPath);

      client.setArgv('dev', '--local', unlinkedPath);
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(devServerInstances).toHaveLength(1);
      expect(devServerInstances[0]).toMatchObject({
        projectId: undefined,
        orgId: undefined,
      });
    });
  });

  describe('--project', () => {
    it('tracks --project telemetry as [REDACTED]', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', `--project=${projectId}`);
      const exitCodePromise = dev(client);

      // dev normally only exits on SIGTERM; here it boots the mocked server.
      await expect(exitCodePromise).resolves.toEqual(undefined);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:project',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});

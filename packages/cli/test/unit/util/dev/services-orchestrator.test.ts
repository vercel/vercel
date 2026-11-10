import { Transform } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runNpmInstall,
  type ExperimentalService,
  type ExperimentalServiceV2,
} from '@vercel/build-utils';
import { ServicesOrchestrator } from '../../../../src/util/dev/services-orchestrator';

const resourceEndpoints = {
  queues: {
    direct: 'http://127.0.0.1:4782',
    proxy: 'http://localhost:3000/_svc/_queues/test-proxy-token',
  },
  runtimeCache: {
    direct: 'http://127.0.0.1:4783/v1/suspense-cache/',
    proxy:
      'http://localhost:3000/_svc/_cache/test-proxy-token/v1/suspense-cache/',
  },
  schedules: {
    direct: 'http://127.0.0.1:4784',
    proxy: 'http://localhost:3000/_svc/_schedules/test-proxy-token',
  },
};

vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  runNpmInstall: vi.fn(async () => false),
}));

const mockedRunNpmInstall = vi.mocked(runNpmInstall);

describe('ServicesOrchestrator', () => {
  beforeEach(() => {
    mockedRunNpmInstall.mockClear();
  });
  it('shares dependency installation metadata across services', async () => {
    const service: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'frontend',
      root: 'frontend',
      framework: 'nextjs',
      builder: { use: '@vercel/next', src: 'frontend/package.json' },
    };
    const orchestrator = new ServicesOrchestrator({
      services: [service],
      cwd: '/project',
      repoRoot: '/project',
      env: {},
      proxyOrigin: 'http://localhost:3000',
      resourceEndpoints,
      useImplicitEnvInjection: false,
    }) as unknown as {
      maybeInstallJSDependencies(
        workspacePath: string,
        logger: {
          stdout: Transform;
          stderr: Transform;
          cleanup(): void;
        }
      ): Promise<void>;
    };
    const sink = () =>
      new Transform({
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });
    const logger = { stdout: sink(), stderr: sink(), cleanup() {} };

    mockedRunNpmInstall.mockImplementationOnce(
      async (_path, _args, _spawnOpts, meta) => {
        if (meta !== undefined) {
          meta.runNpmInstallSet = new Set(['/project/package.json']);
        }
        return true;
      }
    );

    await orchestrator.maybeInstallJSDependencies('/project/frontend', logger);
    await orchestrator.maybeInstallJSDependencies('/project/backend', logger);

    expect(mockedRunNpmInstall).toHaveBeenCalledTimes(2);
    expect(mockedRunNpmInstall.mock.calls[0]?.[3]).toBe(
      mockedRunNpmInstall.mock.calls[1]?.[3]
    );
    expect(mockedRunNpmInstall.mock.calls[1]?.[3]?.runNpmInstallSet).toEqual(
      new Set(['/project/package.json'])
    );
  });

  it('injects queue configuration into a V2 Python service with sidecars', () => {
    const webService: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'backend',
      root: 'backend',
      runtime: 'python',
      entrypoint: 'pyproject.toml',
      builder: {
        use: '@vercel/python',
        src: 'backend/pyproject.toml',
      },
    };
    const sidecar: ExperimentalService = {
      schema: 'experimentalServices',
      name: 'backend-worker',
      type: 'worker',
      trigger: 'queue',
      workspace: 'backend',
      runtime: 'python',
      builder: { use: '@vercel/python', src: 'worker.py' },
      topics: ['jobs'],
    };
    const orchestrator = new ServicesOrchestrator({
      services: [webService, sidecar],
      cwd: '/project',
      repoRoot: '/project',
      env: {},
      proxyOrigin: 'http://localhost:3000',
      resourceEndpoints,
      useImplicitEnvInjection: false,
    });

    const { env } = (
      orchestrator as unknown as {
        getV2StartSpec(service: ExperimentalServiceV2): {
          env: NodeJS.ProcessEnv;
        };
      }
    ).getV2StartSpec(webService);

    expect(env).toMatchObject({
      VERCEL_HAS_WORKER_SERVICES: '1',
      VERCEL_SCHEDULE_BASE_URL: resourceEndpoints.schedules.direct,
      VERCEL_SCHEDULE_TOKEN: 'vc-dev-token',
      VERCEL_SCHEDULE_DEV_API_VERSION: '1',
      VERCEL_QUEUE_BASE_URL: 'http://127.0.0.1:4782',
      VERCEL_QUEUE_TOKEN: 'vc-dev-token',
      VERCEL_REGION: 'dev1',
    });
  });

  it('points every service at the shared dev Runtime Cache', () => {
    const frontend: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'frontend',
      root: 'frontend',
      framework: 'nextjs',
      builder: { use: '@vercel/next', src: 'frontend/package.json' },
    };
    const backend: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'backend',
      root: 'backend',
      runtime: 'python',
      entrypoint: 'pyproject.toml',
      builder: { use: '@vercel/python', src: 'backend/pyproject.toml' },
    };
    const orchestrator = new ServicesOrchestrator({
      services: [frontend, backend],
      cwd: '/project',
      repoRoot: '/project',
      env: {},
      proxyOrigin: 'http://localhost:3000',
      resourceEndpoints,
      useImplicitEnvInjection: false,
    }) as unknown as {
      getV2StartSpec(service: ExperimentalServiceV2): {
        env: NodeJS.ProcessEnv;
      };
    };

    const expected = {
      RUNTIME_CACHE_ENDPOINT: 'http://127.0.0.1:4783/v1/suspense-cache/',
      RUNTIME_CACHE_HEADERS: JSON.stringify({
        authorization: 'Bearer vc-dev-token',
      }),
    };

    expect(orchestrator.getV2StartSpec(frontend).env).toMatchObject(expected);
    expect(orchestrator.getV2StartSpec(backend).env).toMatchObject(expected);

    for (const service of [frontend, backend]) {
      const env = orchestrator.getV2StartSpec(service).env;
      expect(env).toMatchObject({
        VERCEL_QUEUE_BASE_URL: 'http://127.0.0.1:4782',
        VERCEL_QUEUE_TOKEN: 'vc-dev-token',
        VERCEL_REGION: 'dev1',
      });
      expect(env.VERCEL_HAS_WORKER_SERVICES).toBeUndefined();
    }
  });

  it('provides authenticated proxy configuration to container services', () => {
    const service: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'container',
      root: '.',
      runtime: 'container',
      builder: { use: '@vercel/container', src: 'Dockerfile' },
    };
    const orchestrator = new ServicesOrchestrator({
      services: [service],
      cwd: '/project',
      repoRoot: '/project',
      env: {},
      proxyOrigin: 'http://localhost:3000',
      resourceEndpoints,
      useImplicitEnvInjection: false,
    }) as unknown as {
      getV2StartSpec(service: ExperimentalServiceV2): {
        env: NodeJS.ProcessEnv;
      };
      applyContainerResourceProxyEnv(env: NodeJS.ProcessEnv): void;
    };

    const { env } = orchestrator.getV2StartSpec(service);
    orchestrator.applyContainerResourceProxyEnv(env);

    expect(env).toMatchObject({
      VERCEL_QUEUE_BASE_URL:
        'http://localhost:3000/_svc/_queues/test-proxy-token',
      VERCEL_QUEUE_TOKEN: 'vc-dev-token',
      RUNTIME_CACHE_ENDPOINT:
        'http://localhost:3000/_svc/_cache/test-proxy-token/v1/suspense-cache/',
      RUNTIME_CACHE_HEADERS: JSON.stringify({
        authorization: 'Bearer vc-dev-token',
      }),
      VERCEL_SCHEDULE_BASE_URL:
        'http://host.docker.internal:3000/_svc/_schedules/test-proxy-token',
      VERCEL_SCHEDULE_TOKEN: 'vc-dev-token',
      VERCEL_SCHEDULE_DEV_API_VERSION: '1',
    });
  });

  it('overrides inherited schedule credentials for V1 services', () => {
    const service: ExperimentalService = {
      schema: 'experimentalServices',
      name: 'web',
      type: 'web',
      workspace: '.',
      builder: { use: '@vercel/node', src: 'index.ts' },
    };
    const orchestrator = new ServicesOrchestrator({
      services: [service],
      cwd: '/project',
      repoRoot: '/project',
      proxyOrigin: 'http://localhost:3000',
      resourceEndpoints,
      useImplicitEnvInjection: false,
      env: {
        VERCEL_SCHEDULE_BASE_URL: 'https://remote.invalid',
        VERCEL_SCHEDULE_TOKEN: 'remote-token',
      },
    });
    const { env } = (orchestrator as any).getV1StartSpec(service);
    expect(env).toMatchObject({
      VERCEL_SCHEDULE_BASE_URL: resourceEndpoints.schedules.direct,
      VERCEL_SCHEDULE_TOKEN: 'vc-dev-token',
      VERCEL_SCHEDULE_DEV_API_VERSION: '1',
    });
  });

  it('leaves a developer-configured cache endpoint alone', () => {
    const service: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'backend',
      root: 'backend',
      runtime: 'python',
      entrypoint: 'pyproject.toml',
      builder: { use: '@vercel/python', src: 'backend/pyproject.toml' },
    };
    const orchestrator = new ServicesOrchestrator({
      services: [service],
      cwd: '/project',
      repoRoot: '/project',
      env: {
        RUNTIME_CACHE_ENDPOINT: 'https://cache.example.com/v1/suspense-cache/',
      },
      proxyOrigin: 'http://localhost:3000',
      resourceEndpoints,
      useImplicitEnvInjection: false,
    }) as unknown as {
      getV2StartSpec(service: ExperimentalServiceV2): {
        env: NodeJS.ProcessEnv;
      };
    };

    const { env } = orchestrator.getV2StartSpec(service);

    expect(env.RUNTIME_CACHE_ENDPOINT).toBe(
      'https://cache.example.com/v1/suspense-cache/'
    );
    expect(env.RUNTIME_CACHE_HEADERS).toBeUndefined();
  });

  describe('buildpack-backed services', () => {
    function rubyService(
      extra: Partial<ExperimentalServiceV2> = {}
    ): ExperimentalServiceV2 {
      return {
        schema: 'experimentalServicesV2',
        name: 'red',
        root: 'services/red',
        framework: 'ruby',
        runtime: 'ruby',
        builder: {
          use: '@vercel/container',
          src: 'services/red/<detect>',
          config: {
            zeroConfig: true,
            framework: 'ruby',
            buildpack: 'ruby',
            workspace: 'services/red',
          },
        },
        ...extra,
      };
    }

    function createOrchestrator(service: ExperimentalServiceV2) {
      const orchestrator = new ServicesOrchestrator({
        services: [service],
        cwd: '/project',
        repoRoot: '/project',
        env: {},
        proxyOrigin: 'http://localhost:3000',
        resourceEndpoints,
        useImplicitEnvInjection: false,
      });
      const internals = orchestrator as unknown as {
        startService(
          service: ExperimentalServiceV2,
          colorIndex: number
        ): unknown;
        tryStartWithBuilder: ReturnType<typeof vi.fn>;
        spawnDevCommandProcess: ReturnType<typeof vi.fn>;
      };
      internals.tryStartWithBuilder = vi.fn();
      internals.spawnDevCommandProcess = vi.fn(async () => ({
        name: service.name,
        host: '127.0.0.1',
        port: 4000,
        routePrefixes: [],
        workspace: service.root,
      }));
      return internals;
    }

    it('fails with the buildpack error instead of trying the Lambda runtime', async () => {
      const orchestrator = createOrchestrator(rubyService());

      await expect(
        orchestrator.startService(rubyService(), 0)
      ).rejects.toMatchObject({
        code: 'BUILDPACK_DEV_UNSUPPORTED',
        message: '`vercel dev` doesn\'t support the Ruby service "red" yet.',
      });
      expect(orchestrator.tryStartWithBuilder).not.toHaveBeenCalled();
      expect(orchestrator.spawnDevCommandProcess).not.toHaveBeenCalled();
    });

    it('fails even when the service declares a devCommand', async () => {
      const service = rubyService({
        devCommand: 'bundle exec rackup -p $PORT',
      });
      const orchestrator = createOrchestrator(service);

      await expect(orchestrator.startService(service, 0)).rejects.toMatchObject(
        { code: 'BUILDPACK_DEV_UNSUPPORTED' }
      );
      expect(orchestrator.tryStartWithBuilder).not.toHaveBeenCalled();
      expect(orchestrator.spawnDevCommandProcess).not.toHaveBeenCalled();
    });
  });
});

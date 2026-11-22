import { ChildProcess } from 'child_process';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnCommand, type ExperimentalServiceV2 } from '@vercel/build-utils';
import output from '../../../../src/output-manager';
import DevServer from '../../../../src/util/dev/server';
import { ServicesOrchestrator } from '../../../../src/util/dev/services-orchestrator';
import pkg from '../../../../src/util/pkg';

vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  spawnCommand: vi.fn(),
}));

vi.mock('get-port', () => ({ default: vi.fn(async () => 4321) }));

vi.mock('../../../../src/util/dev/port-utils', () => ({
  checkForPort: vi.fn(async () => '127.0.0.1'),
}));

describe.each([
  'DevServer',
  'ServicesOrchestrator',
] as const)('%s dev command environment', path => {
  let child: ChildProcess & { stdout: PassThrough; stderr: PassThrough };
  let cleanupLogger: (() => void) | undefined;

  beforeEach(() => {
    child = Object.assign(new ChildProcess(), {
      pid: 12345,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawnCommand).mockReturnValue(child);
    vi.spyOn(output, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupLogger?.();
    cleanupLogger = undefined;
    child.stdout.unpipe();
    child.stderr.unpipe();
    child.stdout.destroy();
    child.stderr.destroy();
    child.removeAllListeners();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each([
    { name: 'unset', inherited: undefined, project: undefined },
    { name: 'inherited', inherited: 'inherited-version', project: undefined },
    { name: 'project', inherited: undefined, project: 'project-version' },
    {
      name: 'inherited and project',
      inherited: 'inherited-version',
      project: 'project-version',
    },
  ])('sets the CLI version with $name values', async ({
    inherited,
    project,
  }) => {
    vi.stubEnv('VERCEL_CLI_VERSION', inherited);
    vi.stubEnv('CLI_DEV_ENV_TEST', undefined);
    const env = {
      CLI_DEV_ENV_TEST: 'preserved',
      ...(project === undefined ? {} : { VERCEL_CLI_VERSION: project }),
    };
    const cwd = process.cwd();

    if (path === 'DevServer') {
      const server = new DevServer(cwd, {
        projectSettings: { devCommand: 'vite' },
      });
      server.envConfigs.allEnv = env;
      await server.runDevCommand();
    } else {
      const service: ExperimentalServiceV2 = {
        schema: 'experimentalServicesV2',
        name: 'frontend',
        root: '.',
        devCommand: 'vite',
        builder: { use: '@vercel/static-build', src: 'package.json' },
      };
      const orchestrator = new ServicesOrchestrator({
        services: [service],
        cwd,
        repoRoot: cwd,
        env,
        proxyOrigin: 'http://localhost:3000',
        resourceEndpoints: {
          queues: {
            direct: 'http://127.0.0.1:4782',
            proxy: 'http://localhost:3000/_svc/_queues/test-token',
          },
          runtimeCache: {
            direct: 'http://127.0.0.1:4783/v1/suspense-cache/',
            proxy:
              'http://localhost:3000/_svc/_cache/test-token/v1/suspense-cache/',
          },
        },
        useImplicitEnvInjection: false,
      }) as unknown as {
        tryStartWithBuilder(): Promise<null>;
        syncDependencies(): Promise<void>;
        startService(
          service: ExperimentalServiceV2,
          colorIndex: number
        ): Promise<{ logger: { cleanup(): void } }>;
      };
      vi.spyOn(orchestrator, 'tryStartWithBuilder').mockResolvedValue(null);
      vi.spyOn(orchestrator, 'syncDependencies').mockResolvedValue(undefined);
      const result = await orchestrator.startService(service, 0);
      cleanupLogger = result.logger.cleanup;
    }

    expect(spawnCommand).toHaveBeenCalledTimes(1);
    const [command, options] = vi.mocked(spawnCommand).mock.calls[0];
    expect(command).toBe('vite');
    expect(options?.env?.VERCEL_CLI_VERSION).toBe(pkg.version);
    expect(options?.env?.CLI_DEV_ENV_TEST).toBe('preserved');
  });
});

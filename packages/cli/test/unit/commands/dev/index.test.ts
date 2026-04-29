import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dev from '../../../../src/commands/dev';
import { client } from '../../../mocks/client';
import { type fs, vol } from 'memfs';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { useProject } from '../../../mocks/project';

const { mockStart } = vi.hoisted(() => ({
  mockStart: vi.fn<() => void>(),
}));

vi.mock('../../../../src/util/dev/server', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/util/dev/server')
  >('../../../../src/util/dev/server');
  class DevServer {
    devCommand = 'framework dev';
    feed() {}
    stop() {
      return Promise.resolve();
    }
    start = mockStart;
  }
  return {
    default: DevServer,
    DevCommandExitError: actual.DevCommandExitError,
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
});

describe('dev', () => {
  const projectId = 'prj_whatever123';
  const orgId = 'team_123';
  const projectName = 'project-name';
  const projectPath = `/user/name/code/${projectName}`;

  beforeEach(() => {
    useUser();
    useTeams(orgId);
    useProject({
      id: projectId,
      name: projectName,
    });

    const json = {
      '.vercel/project.json': JSON.stringify({
        projectId,
        orgId,
      }),
    };
    vol.fromJSON(json, projectPath);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dev';

      client.setArgv(command, '--help');
      const exitCodePromise = dev(client);
      await expect(exitCodePromise).resolves.toEqual(2);

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

    it('does not show local mode warning for linked projects', async () => {
      client.setArgv('dev', '--local', projectPath);
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
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

  describe('dev command failure', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;

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
        '../../../../src/util/dev/server'
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
        'Error: Dev Command “framework dev” exited with code 127'
      );
    });

    it('exits with code 1 on ServiceStartError', async () => {
      const { ServiceStartError } = await import(
        '../../../../src/util/dev/services-orchestrator'
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
});

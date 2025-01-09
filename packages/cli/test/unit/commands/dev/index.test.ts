import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dev from '../../../../src/commands/dev';
import { client } from '../../../mocks/client';
import { type fs, vol } from 'memfs';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { useProject } from '../../../mocks/project';

vi.mock('../../../../src/util/dev/server', () => {
  class DevServer {
    devCommand = 'framework dev';
    feed() {}
    stop() {}
    start() {}
  }
  return { default: DevServer };
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
});

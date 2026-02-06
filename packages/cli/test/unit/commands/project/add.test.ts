import { describe, expect, it } from 'vitest';
import projects from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useUser } from '../../../mocks/user';

describe('add', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'add';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('[name]', () => {
    it('should add a project', async () => {
      const user = useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('project', 'add', 'test-project');
      await projects(client);

      expect(client.stderr).toOutput(
        `Success! Project test-project added (${user.username})`
      );
    });

    it('tracks argument', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('project', 'add', 'test-project');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:add`,
          value: 'add',
        },
        {
          key: `argument:name`,
          value: '[REDACTED]',
        },
      ]);
    });
  });
});

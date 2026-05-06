import { describe, it, expect } from 'vitest';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';

describe('rename', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'rename';

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

  describe('[name] [new-name]', () => {
    it('should rename a project', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('project', 'rename', 'test-project', 'renamed-project');
      await projects(client);

      expect(client.stderr).toOutput(
        'Success! Project test-project renamed to renamed-project'
      );
    });

    it('tracks arguments', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('project', 'rename', 'test-project', 'renamed-project');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:rename',
          value: 'rename',
        },
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'argument:new-name',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';

describe('add', () => {
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

import { describe, it, expect } from 'vitest';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';
import projects from '../../../../src/commands/project';
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
          key: `subcommand:create`,
          value: 'add',
        },
        {
          key: `argument:name`,
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('subcommand name', () => {
    function useCreation() {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
    }

    it('warns when invoked as the deprecated add name', async () => {
      useCreation();
      client.setArgv('project', 'add', 'test-project');

      expect(await projects(client)).toBe(0);
      await expect(client.stderr).toOutput(
        '`vercel project add` is deprecated. Use `vercel project create`.'
      );
    });

    it('does not warn when invoked as create', async () => {
      useCreation();
      client.setArgv('project', 'create', 'test-project');

      expect(await projects(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    });
  });
});

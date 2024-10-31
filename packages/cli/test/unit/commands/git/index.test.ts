import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import git from '../../../../src/commands/git';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';

describe('git', () => {
  const fixture = (name: string) =>
    join(__dirname, '../../../fixtures/unit/commands/git/connect', name);

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'git';

      client.setArgv(command, '--help');
      const exitCode = await git(client);
      await expect(exitCode, 'exit code for git').toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('displays help when invoked without subcommand', async () => {
    const cwd = fixture('new-connection');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'new-connection',
        name: 'new-connection',
      });
      client.setArgv('git');
      const exitCode = await git(client);
      await expect(exitCode, 'exit code for git').toBe(2);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  describe('unrecognized subcommand', () => {
    it('shows help', async () => {
      const cwd = fixture('new-connection');
      client.cwd = cwd;
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'new-connection',
        name: 'new-connection',
      });
      const args: string[] = ['not-a-command'];
      client.setArgv('git', ...args);

      try {
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        const exitCode = await git(client);
        await expect(exitCode).toEqual(2);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
      }
    });
  });
});

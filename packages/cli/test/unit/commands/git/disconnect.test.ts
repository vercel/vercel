import { describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';
import { useUser } from '../../../mocks/user';
import { useTeams, createTeam } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';
import git from '../../../../src/commands/git';
import type { Project } from '@vercel-internals/types';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

describe('git disconnect', () => {
  const fixture = (name: string) =>
    join(__dirname, '../../../fixtures/unit/commands/git/connect', name);

  describe('--non-interactive', () => {
    it('outputs action_required JSON and exits when not linked and multiple teams (no --scope)', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam();
      client.cwd = cwd;
      client.setArgv('git', 'disconnect', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(git(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_scope');
      expect(payload.message).toContain('--scope');
      expect(payload.message).toContain('non-interactive');
      expect(Array.isArray(payload.choices)).toBe(true);
      expect(payload.choices.length).toBeGreaterThanOrEqual(2);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'git';
      const subcommand = 'disconnect';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = git(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('tracks subcommand invocation', async () => {
    const cwd = fixture('new-connection');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'new-connection',
        name: 'new-connection',
      });
      project.project.link = {
        type: 'github',
        repo: 'repo',
        org: 'user',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      };
      client.setArgv('git', 'disconnect');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Are you sure you want to disconnect user/repo from your project?`
      );
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Disconnected user/repo.');

      const exitCode = await gitPromise;
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:disconnect',
          value: 'disconnect',
        },
      ]);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  describe('--yes', () => {
    it('tracks telemetry', async () => {
      const cwd = fixture('new-connection');
      client.cwd = cwd;
      try {
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        const project = useProject({
          ...defaultProject,
          id: 'new-connection',
          name: 'new-connection',
        });
        project.project.link = {
          type: 'github',
          repo: 'repo',
          org: 'user',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        };
        client.setArgv('git', 'disconnect', '--yes');
        const gitPromise = git(client);

        await expect(client.stderr).toOutput('Disconnected user/repo.');

        const newProjectData: Project = await client.fetch(
          `/v8/projects/new-connection`
        );
        expect(newProjectData.link).toBeUndefined();

        const exitCode = await gitPromise;
        expect(exitCode).toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
      }

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:disconnect',
          value: 'disconnect',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });

  it('should disconnect a repository', async () => {
    const cwd = fixture('new-connection');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'new-connection',
        name: 'new-connection',
      });
      project.project.link = {
        type: 'github',
        repo: 'repo',
        org: 'user',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      };
      client.setArgv('git', 'disconnect');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Are you sure you want to disconnect user/repo from your project?`
      );
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Disconnected user/repo.');

      const newProjectData: Project = await client.fetch(
        `/v8/projects/new-connection`
      );
      expect(newProjectData.link).toBeUndefined();

      const exitCode = await gitPromise;
      expect(exitCode).toEqual(0);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should fail if there is no repository to disconnect', async () => {
    const cwd = fixture('new-connection');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'new-connection',
        name: 'new-connection',
      });

      client.setArgv('git', 'disconnect');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        'No Git repository connected. Run `vercel project connect` to connect one.'
      );

      const exitCode = await gitPromise;
      expect(exitCode).toEqual(1);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });
});

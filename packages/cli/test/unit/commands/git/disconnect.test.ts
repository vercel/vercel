import { describe, expect, it } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';
import git from '../../../../src/commands/git';
import type { Project } from '@vercel-internals/types';

describe('git disconnect', () => {
  const fixture = (name: string) =>
    join(__dirname, '../../../fixtures/unit/commands/git/connect', name);

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

  it('should connect a given repository', async () => {
    const cwd = fixture('no-remote-url');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'no-remote-url',
        name: 'no-remote-url',
      });

      client.setArgv('git', 'connect', 'https://github.com/user2/repo2');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user2/repo2`
      );
      await expect(client.stderr).toOutput(
        `Connected GitHub repository user2/repo2!`
      );

      const newProjectData: Project = await client.fetch(
        `/v8/projects/no-remote-url`
      );
      expect(newProjectData.link).toMatchObject({
        type: 'github',
        repo: 'user2/repo2',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      });

      await expect(gitPromise).resolves.toEqual(0);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should prompt when it finds a repository', async () => {
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

      client.setArgv('git', 'connect', 'https://github.com/user2/repo2');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Found a repository in your local Git Config: https://github.com/user/repo`
      );
      await expect(client.stderr).toOutput(
        `Do you still want to connect https://github.com/user2/repo2? (y/N)`
      );
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user2/repo2`
      );
      await expect(client.stderr).toOutput(
        `Connected GitHub repository user2/repo2!`
      );

      const newProjectData: Project = await client.fetch(
        `/v8/projects/new-connection`
      );
      expect(newProjectData.link).toMatchObject({
        type: 'github',
        repo: 'user2/repo2',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      });

      await expect(gitPromise).resolves.toEqual(0);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should prompt when it finds multiple remotes', async () => {
    const cwd = fixture('multiple-remotes');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'multiple-remotes',
        name: 'multiple-remotes',
      });

      client.setArgv('git', 'connect', 'https://github.com/user3/repo3');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Found multiple Git repositories in your local Git config:\n  • origin: https://github.com/user/repo.git\n  • secondary: https://github.com/user/repo2.git`
      );
      await expect(client.stderr).toOutput(
        `Do you still want to connect https://github.com/user3/repo3? (y/N)`
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user3/repo3`
      );
      await expect(client.stderr).toOutput(
        `Connected GitHub repository user3/repo3!`
      );

      const newProjectData: Project = await client.fetch(
        `/v8/projects/multiple-remotes`
      );
      expect(newProjectData.link).toMatchObject({
        type: 'github',
        repo: 'user3/repo3',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      });

      await expect(gitPromise).resolves.toEqual(0);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should continue as normal when input matches single git remote', async () => {
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

      client.setArgv('git', 'connect', 'https://github.com/user/repo');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user/repo`
      );
      await expect(client.stderr).toOutput(
        `Connected GitHub repository user/repo!`
      );

      const newProjectData: Project = await client.fetch(
        `/v8/projects/new-connection`
      );
      expect(newProjectData.link).toMatchObject({
        type: 'github',
        repo: 'user/repo',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      });

      await expect(gitPromise).resolves.toEqual(0);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });
});

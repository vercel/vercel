import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';
import git from '../../../../src/commands/git';
import type { Project } from '@vercel-internals/types';

describe('git connect', () => {
  const fixture = (name: string) =>
    join(__dirname, '../../../fixtures/unit/commands/git/connect', name);

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'git';
      const subcommand = 'connect';

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

  describe('connecting an unlinked project', () => {
    const cwd = fixture('unlinked');
    beforeEach(async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'unlinked',
        name: 'unlinked',
      });

      client.cwd = cwd;
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
    });

    afterEach(async () => {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    });

    describe('passing [git url]', () => {
      it('tracks telemetry', async () => {
        const remoteUrl = 'https://github.com/user2/repo2';
        client.setArgv('git', 'connect', remoteUrl);
        const gitPromise = git(client);

        await expect(client.stderr).toOutput('Set up');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          'Which scope should contain your project?'
        );
        client.stdin.write('\r');

        await expect(client.stderr).toOutput('Found project');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          `Do you still want to connect https://github.com/user2/repo2?`
        );
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          `Connecting Git remote: https://github.com/user2/repo2`
        );

        const exitCode = await gitPromise;
        await expect(client.stderr).toOutput(
          'Connected GitHub repository user2/repo2!'
        );

        expect(exitCode).toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:connect',
            value: 'connect',
          },
          {
            key: 'argument:gitUrl',
            value: '[REDACTED]',
          },
        ]);
      });
    });

    describe('--yes', () => {
      it('tracks telemetry', async () => {
        client.setArgv('git', 'connect', '--yes');
        const gitPromise = git(client);

        await expect(client.stderr).toOutput(
          `Connecting Git remote: https://github.com/user/repo`
        );
        await expect(client.stderr).toOutput(
          `> Connected GitHub repository user/repo!\n`
        );

        const exitCode = await gitPromise;
        expect(exitCode).toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:connect',
            value: 'connect',
          },
          {
            key: 'flag:yes',
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--confirm', () => {
      it('tracks telemetry', async () => {
        client.setArgv('git', 'connect', '--confirm');
        const gitPromise = git(client);

        await expect(client.stderr).toOutput(
          `Connecting Git remote: https://github.com/user/repo`
        );
        await expect(client.stderr).toOutput(
          `> Connected GitHub repository user/repo!\n`
        );

        const exitCode = await gitPromise;
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:connect',
            value: 'connect',
          },
          {
            key: 'flag:confirm',
            value: 'TRUE',
          },
        ]);
      });
    });

    it('connects an unlinked project', async () => {
      const cwd = fixture('unlinked');
      client.cwd = cwd;
      client.setArgv('git', 'connect');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\r');

      await expect(client.stderr).toOutput('Found project');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user/repo.git`
      );

      const exitCode = await gitPromise;
      await expect(client.stderr).toOutput(
        'Connected GitHub repository user/repo!'
      );

      expect(exitCode).toEqual(0);

      const project: Project = await client.fetch(`/v8/projects/unlinked`);
      expect(project.link).toMatchObject({
        type: 'github',
        repo: 'user/repo',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      });
    });
  });

  it('connects an unlinked project with a remote url', async () => {
    const cwd = fixture('unlinked');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'unlinked',
        name: 'unlinked',
      });
      client.setArgv('git', 'connect', 'https://github.com/user2/repo2');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\r');

      await expect(client.stderr).toOutput('Found project');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Do you still want to connect https://github.com/user2/repo2?`
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user2/repo2`
      );

      const exitCode = await gitPromise;
      await expect(client.stderr).toOutput(
        'Connected GitHub repository user2/repo2!'
      );

      expect(exitCode).toEqual(0);

      const project: Project = await client.fetch(`/v8/projects/unlinked`);
      expect(project.link).toMatchObject({
        type: 'github',
        repo: 'user2/repo2',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      });
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should fail when there is no git config', async () => {
    client.cwd = fixture('no-git-config');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'no-git-config',
      name: 'no-git-config',
    });
    client.setArgv('git', 'connect', '--yes');
    const exitCode = await git(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `Error: No local Git repository found. Run \`git clone <url>\` to clone a remote Git repository first.\n`
    );
  });

  it('should fail when there is no remote url', async () => {
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
      client.setArgv('git', 'connect', '--yes');
      const exitCode = await git(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        `Error: No remote URLs found in your Git config. Make sure you've configured a remote repo in your local Git config. Run \`git remote --help\` for more details.`
      );
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should fail when the remote url is bad', async () => {
    const cwd = fixture('bad-remote-url');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'bad-remote-url',
        name: 'bad-remote-url',
      });
      client.setArgv('git', 'connect', '--yes');
      const exitCode = await git(client);
      expect(exitCode).toEqual(1);

      await expect(client.stderr).toOutput(`Connecting Git remote: bababooey`);
      await expect(client.stderr).toOutput(
        `Error: Failed to parse Git repo data from the following remote URL: bababooey\n`
      );
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should connect a repo to a project that is not already connected', async () => {
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
      client.setArgv('git', 'connect', '--yes');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user/repo`
      );
      await expect(client.stderr).toOutput(
        `> Connected GitHub repository user/repo!\n`
      );

      const exitCode = await gitPromise;
      expect(exitCode).toEqual(0);

      const project: Project = await client.fetch(
        `/v8/projects/new-connection`
      );
      expect(project.link).toMatchObject({
        type: 'github',
        repo: 'user/repo',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      });
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should replace an old connection with a new one', async () => {
    const cwd = fixture('existing-connection');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'existing-connection',
        name: 'existing-connection',
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

      client.setArgv('git', 'connect', '--yes');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user2/repo2`
      );
      await expect(client.stderr).toOutput(
        `> Connected GitHub repository user2/repo2!\n`
      );

      const exitCode = await gitPromise;
      expect(exitCode).toEqual(0);

      const newProjectData: Project = await client.fetch(
        `/v8/projects/existing-connection`
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
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should exit when an already-connected repo is connected', async () => {
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
      client.setArgv('git', 'connect', '--yes');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/user/repo`
      );
      await expect(client.stderr).toOutput(
        `> user/repo is already connected to your project.\n`
      );

      const exitCode = await gitPromise;
      expect(exitCode).toEqual(1);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should fail when it cannot find the repository', async () => {
    const cwd = fixture('invalid-repo');
    client.cwd = cwd;
    try {
      await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'invalid-repo',
        name: 'invalid-repo',
      });

      client.setArgv('git', 'connect', '--yes');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput(
        `Connecting Git remote: https://github.com/laksfj/asdgklsadkl`
      );
      await expect(client.stderr).toOutput(
        `Failed to connect laksfj/asdgklsadkl to project. Make sure there aren't any typos and that you have access to the repository if it's private.`
      );

      const exitCode = await gitPromise;
      expect(exitCode).toEqual(1);
    } finally {
      await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    }
  });

  it('should connect the default option of multiple remotes', async () => {
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

      client.setArgv('git', 'connect');
      const gitPromise = git(client);

      await expect(client.stderr).toOutput('Found multiple remote URLs.');
      await expect(client.stderr).toOutput(
        'Which remote do you want to connect?'
      );

      client.stdin.write('\r');

      await expect(client.stderr).toOutput(
        'Connecting Git remote: https://github.com/user/repo.git'
      );
      await expect(client.stderr).toOutput(
        'Connected GitHub repository user/repo!'
      );

      const exitCode = await gitPromise;
      expect(exitCode).toEqual(0);

      const project: Project = await client.fetch(
        `/v8/projects/multiple-remotes`
      );
      expect(project.link).toMatchObject({
        type: 'github',
        repo: 'user/repo',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      });
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

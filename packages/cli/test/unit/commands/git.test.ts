import { join } from 'path';
import fs from 'fs-extra';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { client } from '../../mocks/client';
import git from '../../../src/commands/git';
import { Project } from '../../../src/types';

describe('git', () => {
  describe('connect', () => {
    const originalCwd = process.cwd();
    const fixture = (name: string) =>
      join(__dirname, '../../fixtures/unit/commands/git/connect', name);

    it('connects an unlinked project', async () => {
      const cwd = fixture('unlinked');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'unlinked',
          name: 'unlinked',
        });
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
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should fail when there is no git config', async () => {
      const cwd = fixture('no-git-config');
      try {
        process.chdir(cwd);
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
      } finally {
        process.chdir(originalCwd);
      }
    });
    it('should fail when there is no remote url', async () => {
      const cwd = fixture('no-remote-url');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
    it('should fail when the remote url is bad', async () => {
      const cwd = fixture('bad-remote-url');
      try {
        process.chdir(cwd);
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

        await expect(client.stderr).toOutput(
          `Connecting Git remote: bababooey`
        );
        await expect(client.stderr).toOutput(
          `Error: Failed to parse Git repo data from the following remote URL: bababooey\n`
        );
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should connect a repo to a project that is not already connected', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
    it('should replace an old connection with a new one', async () => {
      const cwd = fixture('existing-connection');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
    it('should exit when an already-connected repo is connected', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
    it('should fail when it cannot find the repository', async () => {
      const cwd = fixture('invalid-repo');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
    it('should connect the default option of multiple remotes', async () => {
      const cwd = fixture('multiple-remotes');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
  });
  describe('disconnect', () => {
    const originalCwd = process.cwd();
    const fixture = (name: string) =>
      join(__dirname, '../../fixtures/unit/commands/git/connect', name);

    it('should disconnect a repository', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
    it('should fail if there is no repository to disconnect', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
    it('should connect a given repository', async () => {
      const cwd = fixture('no-remote-url');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
    it('should prompt when it finds a repository', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
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
          `Do you still want to connect https://github.com/user2/repo2? [y/N]`
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
        process.chdir(originalCwd);
      }
    });
    it('should prompt when it finds multiple remotes', async () => {
      const cwd = fixture('multiple-remotes');
      try {
        process.chdir(cwd);
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
          `Do you still want to connect https://github.com/user3/repo3? [y/N]`
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
        process.chdir(originalCwd);
      }
    });
    it('should continue as normal when input matches single git remote', async () => {
      const cwd = fixture('new-connection');
      try {
        process.chdir(cwd);
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
        process.chdir(originalCwd);
      }
    });
  });
});

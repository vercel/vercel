import { join } from 'path';
import fs from 'fs-extra';
import link from '../../../src/commands/link';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { client } from '../../mocks/client';

describe('link', () => {
  describe('git prompt', () => {
    const originalCwd = process.cwd();
    const fixture = (name: string) =>
      join(__dirname, '../../fixtures/unit/link-connect-git', name);

    it('should prompt to connect an existing project with a single remote to git', async () => {
      const cwd = fixture('single-remote');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useProject({
          ...defaultProject,
          name: 'single-remote',
          id: 'single-remote',
        });
        useTeams('team_dummy');
        const linkPromise = link(client);

        await expect(client.stderr).toOutput('Set up');
        client.stdin.write('y\n');
        await expect(client.stderr).toOutput('Which scope');
        client.stdin.write('\r');
        await expect(client.stderr).toOutput('Found project');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          'Found local Git remote URL https://github.com/user/repo.git'
        );
        await expect(client.stderr).toOutput(
          'Do you want to connect it to your Vercel project?'
        );
        client.stdin.write('\r');
        await expect(client.stderr).toOutput(
          'Connected GitHub repository user/repo!'
        );
        await expect(client.stderr).toOutput('Linked to');

        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should prompt to replace a connected repository if there is one remote', async () => {
      const cwd = fixture('single-remote-existing-link');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        const project = useProject({
          ...defaultProject,
          name: 'single-remote-existing-link',
          id: 'single-remote-existing-link',
        });
        useTeams('team_dummy');
        project.project.link = {
          type: 'github',
          org: 'user',
          repo: 'repo',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        };

        const linkPromise = link(client);

        await expect(client.stderr).toOutput('Set up');
        client.stdin.write('y\n');
        await expect(client.stderr).toOutput('Which scope');
        client.stdin.write('\r');
        await expect(client.stderr).toOutput('Found project');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          `Found Git remote url https://github.com/user2/repo2.git, which is different from the connected GitHub repository user/repo.`
        );
        await expect(client.stderr).toOutput('Do you want to replace it?');
        client.stdin.write('\r');
        await expect(client.stderr).toOutput(
          'Connected GitHub repository user2/repo2!'
        );
        await expect(client.stderr).toOutput('Linked to');

        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should prompt to connect an existing project with multiple remotes', async () => {
      const cwd = fixture('multiple-remotes');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));

        useUser();
        useProject({
          ...defaultProject,
          name: 'multiple-remotes',
          id: 'multiple-remotes',
        });
        useTeams('team_dummy');

        const linkPromise = link(client);

        await expect(client.stderr).toOutput('Set up');
        client.stdin.write('y\n');
        await expect(client.stderr).toOutput('Which scope');
        client.stdin.write('\r');
        await expect(client.stderr).toOutput('Found project');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          `> Do you want to connect a Git repository to your Vercel project?`
        );
        client.stdin.write('\r');
        await expect(client.stderr).toOutput(
          'Connected GitHub repository user/repo!'
        );
        await expect(client.stderr).toOutput('Linked to');

        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should not prompt to replace a connected repository if there is more than one remote', async () => {
      const cwd = fixture('multiple-remotes');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));

        useUser();
        const project = useProject({
          ...defaultProject,
          name: 'multiple-remotes',
          id: 'multiple-remotes',
        });
        useTeams('team_dummy');
        project.project.link = {
          type: 'github',
          org: 'user',
          repo: 'repo',
          repoId: 1010,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        };

        const linkPromise = link(client);

        await expect(client.stderr).toOutput('Set up');
        client.stdin.write('y\n');
        await expect(client.stderr).toOutput('Which scope');
        client.stdin.write('\r');
        await expect(client.stderr).toOutput('Found project');
        client.stdin.write('y\n');

        expect(client.stderr).not.toOutput('Found multiple Git remote URLs');
        await expect(client.stderr).toOutput('Linked to');

        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
  });
});

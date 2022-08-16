import { join } from 'path';
import fs from 'fs-extra';
import link from '../../../src/commands/link';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import {
  defaultProject,
  useUnknownProject,
  useProject,
} from '../../mocks/project';
import { client } from '../../mocks/client';
import { useDeploymentMissingProjectSettings } from '../../mocks/deployment';
import { Project } from '../../../src/types';

describe('link', () => {
  describe('git prompt', () => {
    const originalCwd = process.cwd();
    const fixture = (name: string) =>
      join(__dirname, '../../fixtures/unit/link-connect-git', name);

    it('should prompt to connect a new project with a single remote', async () => {
      const cwd = fixture('single-remote');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useUnknownProject();
        useDeploymentMissingProjectSettings();
        useTeams('team_dummy');
        const linkPromise = link(client);

        await expect(client.stderr).toOutput('Set up');
        client.stdin.write('y\n');
        await expect(client.stderr).toOutput('Which scope');
        client.stdin.write('\r');
        await expect(client.stderr).toOutput('Link to existing project?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput('What’s your project’s name?');
        client.stdin.write('\r');
        await expect(client.stderr).toOutput(
          'In which directory is your code located?'
        );
        client.stdin.write('\r');
        await expect(client.stderr).toOutput('Want to modify these settings?');
        client.stdin.write('n\n');

        await expect(client.stderr).toOutput(
          'Found local Git remote "origin": https://github.com/user/repo.git'
        );
        await expect(client.stderr).toOutput(
          'Do you want to connect "origin" to your Vercel project?'
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
          'Found local Git remote "origin": https://github.com/user/repo.git'
        );
        await expect(client.stderr).toOutput(
          'Do you want to connect "origin" to your Vercel project?'
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
          `Found Git remote URL https://github.com/user2/repo2.git, which is different from the connected GitHub repository user/repo.`
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
    it('should set a project setting if user opts out', async () => {
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
          'Found local Git remote "origin": https://github.com/user/repo.git'
        );
        await expect(client.stderr).toOutput(
          'Do you want to connect "origin" to your Vercel project?'
        );
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\x1B[B');
        client.stdin.write('\r'); // Opt out

        await expect(client.stderr).toOutput(`Opted out.`);
        await expect(client.stderr).toOutput('Linked to');
        await expect(linkPromise).resolves.toEqual(0);

        const newProjectData: Project = await client.fetch(
          `/v8/projects/single-remote`
        );
        expect(newProjectData.skipGitConnectDuringLink).toBeTruthy();
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should not prompt to connect git if the project has skipGitConnectDuringLink property', async () => {
      const cwd = fixture('single-remote');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));

        useUser();
        const project = useProject({
          ...defaultProject,
          name: 'single-remote',
          id: 'single-remote',
        });
        useTeams('team_dummy');
        project.project.skipGitConnectDuringLink = true;
        const linkPromise = link(client);

        await expect(client.stderr).toOutput('Set up');
        client.stdin.write('y\n');
        await expect(client.stderr).toOutput('Which scope');
        client.stdin.write('\r');
        await expect(client.stderr).toOutput('Found project');
        client.stdin.write('y\n');

        expect(client.stderr).not.toOutput('Found local Git remote "origin"');

        await expect(client.stderr).toOutput('Linked to');
        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should respect --yes', async () => {
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
        client.setArgv('--yes');
        const linkPromise = link(client);
        expect(client.stderr).not.toOutput('Do you want to connect "origin"');
        await expect(client.stderr).toOutput('Linked to');
        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should respect --yes for multiple remotes when origin is not the first', async () => {
      const cwd = fixture('multiple-remotes-prefer-origin');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useProject({
          ...defaultProject,
          name: 'multiple-remotes-prefer-origin',
          id: 'multiple-remotes-prefer-origin',
        });
        useTeams('team_dummy');
        client.setArgv('--yes');
        const linkPromise = link(client);
        expect(client.stderr).not.toOutput('Found multiple Git remote URLs');
        await expect(client.stderr).toOutput(
          'Connected GitHub repository user/repo'
        );
        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
  });
});

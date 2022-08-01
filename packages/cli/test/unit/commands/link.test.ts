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
      const cwd = fixture('existing-single-remote');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
        useUser();
        useProject({
          ...defaultProject,
          name: 'existing-single-remote',
          id: 'existing-single-remote',
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
        await expect(client.stderr).toOutput('✅  Linked');

        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
    it('should prompt to connect an existing project with multiple remotes', async () => {
      const cwd = fixture('existing-multiple-remotes');
      try {
        process.chdir(cwd);
        await fs.rename(join(cwd, 'git'), join(cwd, '.git'));

        useUser();
        useProject({
          ...defaultProject,
          name: 'existing-multiple-remotes',
          id: 'existing-multiple-remotes',
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
        await expect(client.stderr).toOutput('✅  Linked');

        await expect(linkPromise).resolves.toEqual(0);
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
  });
});

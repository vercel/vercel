import { join } from 'path';
import fs from 'fs-extra';
import projects from '../../../src/commands/projects';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { client } from '../../mocks/client';
import { Project } from '../../../src/types';

describe('projects', () => {
  describe('connect', () => {
    const originalCwd = process.cwd();
    const fixture = (name: string) =>
      join(__dirname, '../../fixtures/unit/commands/projects/connect', name);

    // it('connects an unlinked project', async () => {
    //   const cwd = fixture('unlinked');
    //   try {
    //     process.chdir(cwd);
    //     await fs.rename(join(cwd, 'git'), join(cwd, '.git'));
    //     useUser();
    //     useTeams('team_dummy');
    //     useProject({
    //       ...defaultProject,
    //       id: 'unlink',
    //       name: 'unlink',
    //     });
    //     client.setArgv('projects', 'connect', '--cwd', cwd);
    //     const projectsPromise = projects(client);
    //     const exitCode = await projectsPromise;
    //     expect(exitCode, client.outputBuffer).toEqual(0);
    //   } finally {
    //     await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
    //     process.chdir(originalCwd);
    //   }
    // });
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
        client.setArgv('projects', 'connect', '--cwd', cwd, '--yes');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        expect(client.outputBuffer).toContain(
          `Error! No local git repo found. Run \`git clone <url>\` to clone a remote Git repository first.\n`
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
        client.setArgv('projects', 'connect', '--cwd', cwd, '--yes');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        expect(client.outputBuffer).toContain(
          `Error! No remote origin url found in your Git config. Make sure you've connected your local Git repo to a Git provider first.\n`
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
        client.setArgv('projects', 'connect', '--cwd', cwd, '--yes');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        expect(client.outputBuffer).toContain(
          `Error! Can't parse Git repo data from the following remote url in your Git config: bababooey\n`
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
        client.setArgv('projects', 'connect', '--cwd', cwd, '--yes');
        const exitCode = await projects(client);

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
        expect(client.outputBuffer).toContain(`> Connected user/repo!\n`);
        expect(exitCode).toEqual(0);
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

        client.setArgv('projects', 'connect', '--cwd', cwd, '--yes');
        const exitCode = await projects(client);

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
        expect(client.outputBuffer).toContain(`> Connected user2/repo2!\n`);
        expect(exitCode).toEqual(0);
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
        client.setArgv('projects', 'connect', '--cwd', cwd, '--yes');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        expect(client.outputBuffer).toContain(
          `❗️  user/repo is already connected to your project.\n`
        );
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

        client.setArgv('projects', 'connect', '--cwd', cwd, '--yes');
        const exitCode = await projects(client);
        expect(exitCode).toEqual(1);
        expect(client.outputBuffer).toContain(
          `Failed to link laksfj/asdgklsadkl. Make sure there aren't any typos and that you have access to the repository if it's private.`
        );
      } finally {
        await fs.rename(join(cwd, '.git'), join(cwd, 'git'));
        process.chdir(originalCwd);
      }
    });
  });
});

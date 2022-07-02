import { join } from 'path';
import { defaultProject, useProject } from '../../mocks/project';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';
import open from '../../../src/commands/open';
import { client } from '../../mocks/client';

const fixture = (name: string) =>
  join(__dirname, '../../fixtures/unit/commands/open', name);

describe('open', () => {
  const originalCwd = process.cwd();
  let teamSlug: string = '';

  it('should open the dashboard', async () => {
    const cwd = fixture('project');
    try {
      process.chdir(cwd);

      useUser();
      const team = useTeams('team_dummy');
      teamSlug = team[0].slug;
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('open', 'dash');
      const openPromise = open(client, true);
      await expect(client.stderr).toOutput(
        `Opened https://vercel.com/${teamSlug}/test-project`
      );

      const exitCode = await openPromise;
      expect(exitCode).toEqual(0);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should open the preview inspect url', async () => {
    const cwd = fixture('project');
    try {
      process.chdir(cwd);

      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const deploymentId = project?.project?.latestDeployments?.[0].id?.replace(
        'dpl_',
        ''
      );

      client.setArgv('open', 'inspect');
      const openPromise = open(client, true);
      await expect(client.stderr).toOutput(
        `Opened https://vercel.com/${teamSlug}/test-project/${deploymentId}`
      );

      const exitCode = await openPromise;
      expect(exitCode).toEqual(0);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should open the production inspect url', async () => {
    const cwd = fixture('project');
    try {
      process.chdir(cwd);

      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const deploymentId = project?.project?.targets?.production?.id?.replace(
        'dpl_',
        ''
      );

      client.setArgv('open', 'inspect', '--prod');
      const openPromise = open(client, true);
      await expect(client.stderr).toOutput(
        `Opened https://vercel.com/${teamSlug}/test-project/${deploymentId}`
      );

      const exitCode = await openPromise;
      expect(exitCode).toEqual(0);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should open the preview deploy url', async () => {
    const cwd = fixture('project');
    try {
      process.chdir(cwd);

      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const url = project?.project?.latestDeployments?.[0]?.url;

      client.setArgv('open', 'deploy');
      const openPromise = open(client, true);
      await expect(client.stderr).toOutput(`Opened https://${url}`);

      const exitCode = await openPromise;
      expect(exitCode).toEqual(0);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should open the production deploy url', async () => {
    const cwd = fixture('project');
    try {
      process.chdir(cwd);

      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const url = project?.project?.targets?.production?.url;

      client.setArgv('open', 'deploy', '--prod');
      const openPromise = open(client, true);
      await expect(client.stderr).toOutput(`Opened https://${url}`);

      const exitCode = await openPromise;
      expect(exitCode).toEqual(0);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should open the latest preview deploy url from dropdown', async () => {
    const cwd = fixture('project');
    try {
      process.chdir(cwd);

      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const url = project?.project?.latestDeployments?.[0]?.url;

      client.setArgv('open');
      const openPromise = open(client, true);

      await expect(client.stderr).toOutput('What do you want to open?');
      client.stdin.write('\x1B[B'); // down arrow
      client.stdin.write('\r'); // return

      await expect(client.stderr).toOutput(`Opened https://${url}`);
      const exitCode = await openPromise;
      expect(exitCode).toEqual(0);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should fail when there are no deployments', async () => {
    const cwd = fixture('no-deployments');
    try {
      process.chdir(cwd);

      useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        id: 'no-deployments',
        name: 'no-deployments',
      });
      project.project.latestDeployments = undefined;

      client.setArgv('open', 'inspect');
      const openPromiseInspect = open(client, true);

      await expect(client.stderr).toOutput(
        'No deployments found. Run `vercel deploy` to create a deployment.'
      );
      const exitCodeInspect = await openPromiseInspect;
      expect(exitCodeInspect).toEqual(1);

      client.setArgv('open', 'deploy');
      const openPromiseDeploy = open(client, true);

      await expect(client.stderr).toOutput(
        'No deployments found. Run `vercel deploy` to create a deployment.'
      );
      const exitCodeDeploy = await openPromiseDeploy;
      expect(exitCodeDeploy).toEqual(1);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

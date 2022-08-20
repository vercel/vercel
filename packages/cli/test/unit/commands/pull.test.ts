import fs from 'fs-extra';
import path from 'path';
import pull from '../../../src/commands/pull';
import { setupFixture } from '../../helpers/setup-fixture';
import { client } from '../../mocks/client';
import { defaultProject, useProject } from '../../mocks/project';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';
import { useDeploymentMissingProjectSettings } from '../../mocks/deployment';
import { Project } from '../../../src/types';

describe('pull', () => {
  it('should handle pulling', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    client.setArgv('pull', cwd);
    const exitCodePromise = pull(client);
    await expect(client.stderr).toOutput(
      'Downloading `development` Environment Variables for Project vercel-pull-next'
    );
    await expect(client.stderr).toOutput(
      `Created .vercel${path.sep}.env.development.local file`
    );
    await expect(client.stderr).toOutput(
      `Downloaded project settings to .vercel${path.sep}project.json`
    );
    await expect(exitCodePromise).resolves.toEqual(0);

    const rawDevEnv = await fs.readFile(
      path.join(cwd, '.vercel', '.env.development.local')
    );
    const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
    expect(devFileHasDevEnv).toBeTruthy();
  });

  it('should fail with message to pull without a link and without --env', async () => {
    client.stdin.isTTY = false;

    const cwd = setupFixture('vercel-pull-unlinked');
    useUser();
    useTeams('team_dummy');

    client.setArgv('pull', cwd);
    const exitCodePromise = pull(client);
    await expect(client.stderr).toOutput(
      'Command `vercel pull` requires confirmation. Use option "--yes" to confirm.'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should fail without message to pull without a link and with --env', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams('team_dummy');

    client.setArgv('pull', cwd, '--yes');
    const exitCodePromise = pull(client);
    await expect(client.stderr).not.toOutput(
      'Command `vercel pull` requires confirmation. Use option "--yes" to confirm.'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should link an unlinked project with a git config without connecing a git provider', async () => {
    const cwd = setupFixture('vercel-pull-unlinked-git');

    try {
      await fs.rename(path.join(cwd, 'git'), path.join(cwd, '.git'));

      let project: Project;
      let projectWasLinked = false;

      client.scenario.get(`/v8/projects/:projectNameOrId`, (_req, res) => {
        res.status(404).send();
      });
      client.scenario.post(`/:version/projects`, (req, res) => {
        const { name } = req.body;
        project = {
          ...defaultProject,
          name,
          id: name,
        };
        res.json(project);
      });
      client.scenario.post(`/v9/projects/:projectNameOrId/link`, (req, res) => {
        projectWasLinked = true;

        const { type, repo, org } = req.body;
        project.link = {
          type,
          repo,
          repoId: 1010,
          org,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        };
        res.json(project);
      });
      client.scenario.patch(
        `/:version/projects/:projectNameOrId`,
        (req, res) => {
          Object.assign(project, req.body);
          res.json(project);
        }
      );
      client.scenario.get(`/v8/projects/:id/env`, (_req, res) => {
        res.json({ envs: [] });
      });

      useDeploymentMissingProjectSettings();
      useUser();
      useTeams('team_dummy');

      client.setArgv('pull', cwd, '--yes');
      const exitCodePromise = pull(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(projectWasLinked).toBe(false);
    } finally {
      await fs.rename(path.join(cwd, '.git'), path.join(cwd, 'git'));
    }
  });

  it('should handle pulling with env vars (headless mode)', async () => {
    try {
      process.env.VERCEL_PROJECT_ID = 'vercel-pull-next';
      process.env.VERCEL_ORG_ID = 'team_dummy';

      const cwd = setupFixture('vercel-pull-next');

      // Remove the `.vercel` dir to ensure that the `pull`
      // command creates a new one based on env vars
      await fs.remove(path.join(cwd, '.vercel'));

      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-pull-next',
        name: 'vercel-pull-next',
      });
      client.setArgv('pull', cwd);
      const exitCodePromise = pull(client);
      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables for Project vercel-pull-next'
      );
      await expect(client.stderr).toOutput(
        `Created .vercel${path.sep}.env.development.local file`
      );
      await expect(client.stderr).toOutput(
        `Downloaded project settings to .vercel${path.sep}project.json`
      );
      await expect(exitCodePromise).resolves.toEqual(0);

      const config = await fs.readJSON(path.join(cwd, '.vercel/project.json'));
      expect(config).toMatchInlineSnapshot(`
        Object {
          "orgId": "team_dummy",
          "projectId": "vercel-pull-next",
          "settings": Object {
            "createdAt": 1555413045188,
          },
        }
      `);
    } finally {
      delete process.env.VERCEL_PROJECT_ID;
      delete process.env.VERCEL_ORG_ID;
    }
  });

  it('should handle --environment=preview flag', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    client.setArgv('pull', '--environment=preview', cwd);
    const exitCodePromise = pull(client);
    await expect(client.stderr).toOutput(
      'Downloading `preview` Environment Variables for Project vercel-pull-next'
    );
    await expect(client.stderr).toOutput(
      `Created .vercel${path.sep}.env.preview.local file`
    );
    await expect(client.stderr).toOutput(
      `Downloaded project settings to .vercel${path.sep}project.json`
    );
    await expect(exitCodePromise).resolves.toEqual(0);

    const rawPreviewEnv = await fs.readFile(
      path.join(cwd, '.vercel', '.env.preview.local')
    );
    const previewFileHasPreviewEnv = rawPreviewEnv
      .toString()
      .includes('REDIS_CONNECTION_STRING');
    expect(previewFileHasPreviewEnv).toBeTruthy();
  });

  it('should handle --environment=production flag', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    client.setArgv('pull', '--environment=production', cwd);
    const exitCodePromise = pull(client);
    await expect(client.stderr).toOutput(
      'Downloading `production` Environment Variables for Project vercel-pull-next'
    );
    await expect(client.stderr).toOutput(
      `Created .vercel${path.sep}.env.production.local file`
    );
    await expect(client.stderr).toOutput(
      `Downloaded project settings to .vercel${path.sep}project.json`
    );
    await expect(exitCodePromise).resolves.toEqual(0);

    const rawProdEnv = await fs.readFile(
      path.join(cwd, '.vercel', '.env.production.local')
    );
    const previewFileHasPreviewEnv1 = rawProdEnv
      .toString()
      .includes('REDIS_CONNECTION_STRING');
    expect(previewFileHasPreviewEnv1).toBeTruthy();
    const previewFileHasPreviewEnv2 = rawProdEnv
      .toString()
      .includes('SQL_CONNECTION_STRING');
    expect(previewFileHasPreviewEnv2).toBeTruthy();
  });
});

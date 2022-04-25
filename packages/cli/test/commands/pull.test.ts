import fs from 'fs-extra';
import path from 'path';
import pull from '../../src/commands/pull';
import { setupFixture } from '../helpers/setup-fixture';
import { client } from '../mocks/client';
import { defaultProject, useProject } from '../mocks/project';
import { useTeams } from '../mocks/team';
import { useUser } from '../mocks/user';

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
    const exitCode = await pull(client);
    expect(exitCode, client.outputBuffer).toEqual(0);

    const rawDevEnv = await fs.readFile(
      path.join(cwd, '.vercel', '.env.development.local')
    );
    const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
    expect(devFileHasDevEnv).toBeTruthy();
  });

  it('should fail with message to pull without a link and without --env', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams('team_dummy');

    client.setArgv('pull', cwd);
    const exitCode = await pull(client);
    expect(exitCode, client.outputBuffer).toEqual(1);

    expect(client.outputBuffer).toMatch(
      /Command `vercel pull` requires confirmation. Use option "--yes" to confirm./gm
    );
  });

  it('should fail without message to pull without a link and with --env', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams('team_dummy');

    client.setArgv('pull', cwd, '--yes');
    const exitCode = await pull(client);
    expect(exitCode, client.outputBuffer).toEqual(1);

    expect(client.outputBuffer).not.toMatch(
      /Command `vercel pull` requires confirmation. Use option "--yes" to confirm./gm
    );
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
      const exitCode = await pull(client);
      expect(exitCode, client.outputBuffer).toEqual(0);

      const config = await fs.readJSON(path.join(cwd, '.vercel/project.json'));
      expect(config).toMatchInlineSnapshot(`
        Object {
          "orgId": "team_dummy",
          "projectId": "vercel-pull-next",
          "settings": Object {},
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
    const exitCode = await pull(client);
    expect(exitCode).toEqual(0);

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
    const exitCode = await pull(client);
    expect(exitCode).toEqual(0);

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

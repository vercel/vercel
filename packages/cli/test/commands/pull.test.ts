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
    useTeams();
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    client.setArgv('pull', '--yes', cwd);
    const exitCode = await pull(client);
    expect(exitCode, client.outputBuffer).toEqual(0);

    const rawDevEnv = await fs.readFile(
      path.join(cwd, '.vercel', '.env.development.local')
    );
    const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
    expect(devFileHasDevEnv).toBeTruthy();
  });

  it('should handle --environment=preview flag', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams();
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    client.setArgv('pull', '--yes', '--environment=preview', cwd);
    const exitCode = await pull(client);
    expect(exitCode, client.outputBuffer).toEqual(0);

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
    useTeams();
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    client.setArgv('pull', '--yes', '--environment=production', cwd);
    const exitCode = await pull(client);
    expect(exitCode, client.outputBuffer).toEqual(0);

    const rawProdEnv = await fs.readFile(
      path.join(cwd, '.vercel', '.env.production.local')
    );
    const productionFileHasProductionEnv1 = rawProdEnv
      .toString()
      .includes('REDIS_CONNECTION_STRING');
    expect(productionFileHasProductionEnv1).toBeTruthy();
    const productionFileHasProductionEnv2 = rawProdEnv
      .toString()
      .includes('SQL_CONNECTION_STRING');
    expect(productionFileHasProductionEnv2).toBeTruthy();
  });
});

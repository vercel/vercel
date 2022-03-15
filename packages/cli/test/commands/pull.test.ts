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
    expect(exitCode).toEqual(0);

    const devEnvFileExists = fs.pathExistsSync(
      path.join(cwd, '.env.development.local')
    );
    expect(devEnvFileExists).toBeTruthy();

    const rawDevEnv = await fs.readFile(
      path.join(cwd, '.env.development.local')
    );
    const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
    expect(devFileHasDevEnv).toBeTruthy();

    const previewEnvFileExists = fs.pathExistsSync(
      path.join(cwd, '.env.preview.local')
    );
    expect(previewEnvFileExists).toBeTruthy();

    const rawPreviewEnv = await fs.readFile(
      path.join(cwd, '.env.preview.local')
    );
    const previewFileHasPreviewEnv = rawPreviewEnv
      .toString()
      .includes('REDIS_CONNECTION_STRING');
    expect(previewFileHasPreviewEnv).toBeTruthy();

    const prodEnvFileExists = fs.pathExistsSync(
      path.join(cwd, '.env.production.local')
    );
    expect(prodEnvFileExists).toBeTruthy();

    const rawProdEnv = await fs.readFile(
      path.join(cwd, '.env.production.local')
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

  it('should handle custom --env flag', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams();
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    const expectedEnvFilename = '.env.vercel.development.local';
    client.setArgv('pull', '--yes', '--env=.env.vercel', cwd);

    const exitCode = await pull(client);
    const actualEnv = await fs.pathExists(path.join(cwd, expectedEnvFilename));
    const raw = await fs.readFile(path.join(cwd, expectedEnvFilename));

    expect(exitCode).toEqual(0);
    expect(actualEnv).toBeTruthy();
    expect(raw.includes('# Created by Vercel CLI')).toBeTruthy();
  });
});

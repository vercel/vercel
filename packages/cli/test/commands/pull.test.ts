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

    // deprecated location
    const rawDeprecatedDevEnv = await fs.readFile(path.join(cwd, '.env'));
    const devDeprecatedFileHasDevEnv = rawDeprecatedDevEnv
      .toString()
      .includes('SPECIAL_FLAG');
    expect(devDeprecatedFileHasDevEnv).toBeTruthy();

    // new location
    const rawDevEnv = await fs.readFile(
      path.join(cwd, '.vercel', '.env.development.local')
    );
    const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
    expect(devFileHasDevEnv).toBeTruthy();
  });

  it('should handle custom --env-file flag', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams();
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    const expectedEnvFilename = '.env.vercel';
    client.setArgv('pull', '--yes', `--env-file=${expectedEnvFilename}`, cwd);

    const exitCode = await pull(client);
    const actualEnv = await fs.pathExists(path.join(cwd, expectedEnvFilename));
    const raw = await fs.readFile(path.join(cwd, expectedEnvFilename));

    expect(exitCode).toEqual(0);
    expect(actualEnv).toBeTruthy();
    expect(raw.includes('# Created by Vercel CLI')).toBeTruthy();

    // --env flag does not affect nested (under .vercel) files
    const nestedEnvFileExists = await fs.pathExists(
      path.join(cwd, '.vercel', '.env.development.local')
    );
    expect(nestedEnvFileExists).toBeTruthy();
  });

  it('should warn when using deprecated --env flag', async () => {
    const cwd = setupFixture('vercel-pull-next');
    useUser();
    useTeams();
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    const expectedEnvFilename = '.env.vercel';
    client.setArgv('pull', '--yes', `--env=${expectedEnvFilename}`, cwd);

    const exitCode = await pull(client);
    expect(exitCode).toBe(0);
    expect(client.outputBuffer).toMatch(
      /WARN! --env deprecated: please use --env-file instead/
    );
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
    useTeams();
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    client.setArgv('pull', '--yes', '--environment=production', cwd);
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

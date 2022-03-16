import fs from 'fs-extra';
import path from 'path';
import pull from '../../src/commands/pull';
import { setupFixture } from '../helpers/setup-fixture';
import { client } from '../mocks/client';
import { defaultProject, useProject } from '../mocks/project';
import { useTeams } from '../mocks/team';
import { useUser } from '../mocks/user';

describe('pull', () => {
  describe('deprecated .env location: "${root}/.env"', function () {
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
      const expectedEnvFilename = '.env.vercel';
      client.setArgv('pull', '--yes', `--env=${expectedEnvFilename}`, cwd);

      const exitCode = await pull(client);
      const actualEnv = await fs.pathExists(
        path.join(cwd, expectedEnvFilename)
      );
      const raw = await fs.readFile(path.join(cwd, expectedEnvFilename));

      expect(exitCode).toEqual(0);
      expect(actualEnv).toBeTruthy();
      expect(raw.includes('# Created by Vercel CLI')).toBeTruthy();
    });
  });

  describe('new .env location: "${root}/.vercel/.env.${target}.local', function () {
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
        path.join(cwd, '.vercel', '.env.development.local')
      );
      expect(devEnvFileExists).toBeTruthy();

      const rawDevEnv = await fs.readFile(
        path.join(cwd, '.vercel', '.env.development.local')
      );
      const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
      expect(devFileHasDevEnv).toBeTruthy();

      const previewEnvFileExists = fs.pathExistsSync(
        path.join(cwd, '.vercel', '.env.preview.local')
      );
      expect(previewEnvFileExists).toBeTruthy();

      const rawPreviewEnv = await fs.readFile(
        path.join(cwd, '.vercel', '.env.preview.local')
      );
      const previewFileHasPreviewEnv = rawPreviewEnv
        .toString()
        .includes('REDIS_CONNECTION_STRING');
      expect(previewFileHasPreviewEnv).toBeTruthy();

      const prodEnvFileExists = fs.pathExistsSync(
        path.join(cwd, '.vercel', '.env.production.local')
      );
      expect(prodEnvFileExists).toBeTruthy();

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

    it('should handle custom --env flag', async () => {
      const cwd = setupFixture('vercel-pull-next');
      useUser();
      useTeams();
      useProject({
        ...defaultProject,
        id: 'vercel-pull-next',
        name: 'vercel-pull-next',
      });

      client.setArgv('pull', '--yes', '--env=.env.vercel', cwd);
      const exitCode = await pull(client);
      expect(exitCode).toEqual(0);

      const rootEnvFileExists = await fs.pathExists(
        path.join(cwd, '.env.vercel')
      );
      expect(rootEnvFileExists).toBeTruthy();

      const nestedEnvFileExists = await fs.pathExists(
        path.join(cwd, '.vercel', '.env.development.local')
      );
      expect(nestedEnvFileExists).toBeTruthy();
    });
  });
});

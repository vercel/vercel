import fs from 'fs-extra';
import path from 'path';
import env from '../../src/commands/env';
import { setupFixture } from '../helpers/setup-fixture';
import { client } from '../mocks/client';
import { defaultProject, useProject } from '../mocks/project';
import { useTeams } from '../mocks/team';
import { useUser } from '../mocks/user';

describe('env', () => {
  describe('pull', () => {
    it('should handle pulling', async () => {
      const cwd = setupFixture('vercel-env-pull');
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      client.setArgv('env', 'pull', '--yes', '--cwd', cwd);
      const exitCode = await env(client);
      expect(exitCode, client.outputBuffer).toEqual(0);

      const rawDevEnv = await fs.readFile(path.join(cwd, '.env'));

      // check for development env value
      const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
      expect(devFileHasDevEnv).toBeTruthy();
    });

    it('should handle alternate filename', async () => {
      const cwd = setupFixture('vercel-env-pull');
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      client.setArgv('env', 'pull', 'other.env', '--yes', '--cwd', cwd);
      const exitCode = await env(client);
      expect(exitCode, client.outputBuffer).toEqual(0);

      const rawDevEnv = await fs.readFile(path.join(cwd, 'other.env'));

      // check for development env value
      const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
      expect(devFileHasDevEnv).toBeTruthy();
    });

    it('should expose production system env variables', async () => {
      const cwd = setupFixture('vercel-env-pull');
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
        autoExposeSystemEnvs: true,
      });

      client.setArgv('env', 'pull', 'other.env', '--yes', '--cwd', cwd);
      const exitCode = await env(client);
      expect(exitCode, client.outputBuffer).toEqual(0);

      const rawDevEnv = await fs.readFile(path.join(cwd, 'other.env'));

      const productionFileHasVercelEnv = rawDevEnv
        .toString()
        .includes('VERCEL_ENV="development"');
      expect(productionFileHasVercelEnv).toBeTruthy();
    });
  });
});

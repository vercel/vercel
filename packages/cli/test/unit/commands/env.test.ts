import fs from 'fs-extra';
import path from 'path';
import env from '../../../src/commands/env';
import { setupFixture } from '../../helpers/setup-fixture';
import { client } from '../../mocks/client';
import { defaultProject, useProject } from '../../mocks/project';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';

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
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables for Project vercel-env-pull'
      );
      await expect(client.stderr).toOutput('Created .env file');
      await expect(exitCodePromise).resolves.toEqual(0);

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
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables for Project vercel-env-pull'
      );
      await expect(client.stderr).toOutput('Created other.env file');
      await expect(exitCodePromise).resolves.toEqual(0);

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
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables for Project vercel-env-pull'
      );
      await expect(client.stderr).toOutput('Created other.env file');
      await expect(exitCodePromise).resolves.toEqual(0);

      const rawDevEnv = await fs.readFile(path.join(cwd, 'other.env'));

      const productionFileHasVercelEnv = rawDevEnv
        .toString()
        .includes('VERCEL_ENV="development"');
      expect(productionFileHasVercelEnv).toBeTruthy();
    });

    it('should show a delta string', async () => {
      const cwd = setupFixture('env-pull-delta');
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'env-pull-delta',
        name: 'env-pull-delta',
      });

      client.setArgv('env', 'add', 'NEW_VAR', '--cwd', cwd);
      const addPromise = env(client);

      await expect(client.stderr).toOutput('What’s the value of NEW_VAR?');
      client.stdin.write('testvalue\n');

      await expect(client.stderr).toOutput(
        'Add NEW_VAR to which Environments (select multiple)?'
      );
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\x1B[B');
      client.stdin.write(' ');
      client.stdin.write('\r');

      await expect(addPromise).resolves.toEqual(0);

      client.setArgv('env', 'pull', '--yes', '--cwd', cwd);
      const pullPromise = env(client);
      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables for Project env-pull-delta'
      );
      await expect(client.stderr).toOutput('Updated .env file');
      await expect(client.stderr).toOutput(
        '+ NEW_VAR\n~ SPECIAL_FLAG\n- TEST\n'
      );

      await expect(pullPromise).resolves.toEqual(0);
    });
  });
});

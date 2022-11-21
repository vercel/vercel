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

    it('should use given environment', async () => {
      const cwd = setupFixture('vercel-env-pull');
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });

      client.setArgv(
        'env',
        'pull',
        '--environment',
        'production',
        '--cwd',
        cwd
      );
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        `Downloading \`production\` Environment Variables for Project vercel-env-pull`
      );
      await expect(client.stderr).toOutput('Created .env file');
      await expect(exitCodePromise).resolves.toEqual(0);

      const rawProdEnv = await fs.readFile(path.join(cwd, '.env'));

      // check for development env value
      const envFileHasEnv = rawProdEnv
        .toString()
        .includes('REDIS_CONNECTION_STRING');
      expect(envFileHasEnv).toBeTruthy();
    });

    it('should throw an error when it does not recognize given environment', async () => {
      const cwd = setupFixture('vercel-env-pull');
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });

      client.setArgv(
        'env',
        'pull',
        '.env.production',
        '--environment',
        'something-invalid',
        '--cwd',
        cwd
      );

      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        `Invalid environment \`something-invalid\`. Valid options: <production | preview | development>`
      );

      await expect(exitCodePromise).resolves.toEqual(1);
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
      const cwd = setupFixture('vercel-env-pull-delta');
      try {
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
        await expect(client.stderr).toOutput(
          '+ SPECIAL_FLAG (Updated)\n+ NEW_VAR\n- TEST\n'
        );
        await expect(client.stderr).toOutput('Updated .env file');

        await expect(pullPromise).resolves.toEqual(0);
      } finally {
        client.setArgv('env', 'rm', 'NEW_VAR', '--yes', '--cwd', cwd);
        await env(client);
      }
    });

    it('should not show a delta string when it fails to read a file', async () => {
      const cwd = setupFixture('vercel-env-pull-delta-corrupt');
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'env-pull-delta-corrupt',
        name: 'env-pull-delta-corrupt',
      });

      client.setArgv('env', 'pull', '--yes', '--cwd', cwd);
      const pullPromise = env(client);
      await expect(client.stderr).toOutput('Updated .env file');
      await expect(pullPromise).resolves.toEqual(0);
    });

    it('should show that no changes were found', async () => {
      const cwd = setupFixture('vercel-env-pull-delta-no-changes');
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'env-pull-delta-no-changes',
        name: 'env-pull-delta-no-changes',
      });

      client.setArgv('env', 'pull', '--yes', '--cwd', cwd);
      const pullPromise = env(client);
      await expect(client.stderr).toOutput('> No changes found.');
      await expect(client.stderr).toOutput('Updated .env file');
      await expect(pullPromise).resolves.toEqual(0);
    });

    it('should correctly render delta string when env variable has quotes', async () => {
      const cwd = setupFixture('vercel-env-pull-delta-quotes');
      try {
        useUser();
        useTeams('team_dummy');
        defaultProject.env.push({
          type: 'encrypted',
          id: '781dt89g8r2h789g',
          key: 'NEW_VAR',
          value: '"testvalue"',
          target: ['development'],
          gitBranch: null,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        });
        useProject({
          ...defaultProject,
          id: 'env-pull-delta-quotes',
          name: 'env-pull-delta-quotes',
        });

        client.setArgv('env', 'pull', '--yes', '--cwd', cwd);
        const pullPromise = env(client);
        await expect(client.stderr).toOutput(
          'Downloading `development` Environment Variables for Project env-pull-delta'
        );
        await expect(client.stderr).toOutput('No changes found.\n');
        await expect(client.stderr).toOutput('Updated .env file');

        await expect(pullPromise).resolves.toEqual(0);
      } finally {
        client.setArgv('env', 'rm', 'NEW_VAR', '--yes', '--cwd', cwd);
        await env(client);
        defaultProject.env.pop();
      }
    });

    it('should correctly render delta string when local env variable has quotes', async () => {
      const cwd = setupFixture('vercel-env-pull-delta-quotes');
      try {
        useUser();
        useTeams('team_dummy');
        defaultProject.env.push({
          type: 'encrypted',
          id: '781dt89g8r2h789g',
          key: 'NEW_VAR',
          value: 'testvalue',
          target: ['development'],
          gitBranch: null,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        });
        useProject({
          ...defaultProject,
          id: 'env-pull-delta-quotes',
          name: 'env-pull-delta-quotes',
        });

        client.setArgv('env', 'pull', '.env.testquotes', '--yes', '--cwd', cwd);
        const pullPromise = env(client);
        await expect(client.stderr).toOutput(
          'Downloading `development` Environment Variables for Project env-pull-delta'
        );
        await expect(client.stderr).toOutput('No changes found.\n');
        await expect(client.stderr).toOutput('Updated .env.testquotes file');

        await expect(pullPromise).resolves.toEqual(0);
      } finally {
        client.setArgv('env', 'rm', 'NEW_VAR', '--yes', '--cwd', cwd);
        await env(client);
        defaultProject.env.pop();
      }
    });
  });
});

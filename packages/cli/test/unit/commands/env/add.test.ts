import { describe, expect, it } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env add', () => {
  describe('[name]', () => {
    describe.todo('--sensitive');
    describe.todo('--force');

    describe('[environment]', () => {
      describe('[gitBranch]', () => {
        it('should allow `gitBranch` to be passed', async () => {
          useUser();
          useTeams('team_dummy');
          useProject(
            {
              ...defaultProject,
              id: 'vercel-env-pull',
              name: 'vercel-env-pull',
            },
            [
              ...envs,
              {
                type: 'encrypted',
                id: '781dt89g8r2h789g',
                key: 'REDIS_CONNECTION_STRING',
                value: 'redis://abc123@redis.example.dev:6379',
                target: ['development'],
                gitBranch: undefined,
                configurationId: null,
                updatedAt: 1557241361455,
                createdAt: 1557241361455,
              },
            ]
          );
          const cwd = setupUnitFixture('vercel-env-pull');
          client.cwd = cwd;
          client.setArgv(
            'env',
            'add',
            'REDIS_CONNECTION_STRING',
            'preview',
            'branchName'
          );
          const exitCodePromise = env(client);
          await expect(client.stderr).toOutput(
            "What's the value of REDIS_CONNECTION_STRING?"
          );
          client.stdin.write('testvalue\n');
          await expect(client.stderr).toOutput(
            'Added Environment Variable REDIS_CONNECTION_STRING to Project vercel-env-pull'
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });
      });
    });
  });
});

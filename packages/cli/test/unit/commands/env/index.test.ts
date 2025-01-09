import { describe, it, beforeEach, expect } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('env', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';

      client.setArgv(command, '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('env');
    const exitCodePromise = env(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  describe('unrecognized subcommand', () => {
    beforeEach(() => {
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
    });

    it('shows help', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('env', ...args);
      const exitCode = await env(client);
      expect(exitCode).toEqual(2);
    });
  });
});

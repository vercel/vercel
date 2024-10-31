import { describe, it, expect, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env rm', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject(
      {
        ...defaultProject,
        id: 'vercel-env-rm',
        name: 'vercel-env-rm',
      },
      [
        {
          type: 'encrypted',
          id: '781dt89g8r2h789g',
          key: 'ENVIRONMENT_NAME',
          value: 'redis://abc123@redis.example.dev:6379',
          target: ['development'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    const cwd = setupUnitFixture('commands/env/vercel-env-rm');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('[name]', () => {
    describe('--yes', () => {
      it('tracks [name] and `--yes`', async () => {
        client.setArgv('env', 'rm', 'ENVIRONMENT_NAME', '--yes');
        await env(client);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:rm`,
            value: 'rm',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `flag:yes`,
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('[environment]', () => {
      describe('[git-branch]', () => {
        it('tracks `[environment]` and `[git-branch]` arguments', async () => {
          client.setArgv(
            'env',
            'rm',
            'ENVIRONMENT_NAME',
            'development',
            'main',
            '--yes'
          );
          await env(client);
          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: `subcommand:rm`,
              value: 'rm',
            },
            {
              key: `argument:name`,
              value: '[REDACTED]',
            },
            {
              key: `argument:environment`,
              value: 'development',
            },
            {
              key: `argument:git-branch`,
              value: '[REDACTED]',
            },
            {
              key: `flag:yes`,
              value: 'TRUE',
            },
          ]);
        });
      });
    });
  });
});

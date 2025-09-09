import { describe, expect, it, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env add', () => {
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

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'add';

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
    describe('--sensitive', () => {
      it('tracks flag', async () => {
        client.setArgv(
          'env',
          'add',
          'SENSITIVE_FLAG',
          'preview',
          'branchName',
          '--sensitive'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of SENSITIVE_FLAG?"
        );
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: 'preview',
          },
          {
            key: `argument:git-branch`,
            value: '[REDACTED]',
          },
          {
            key: `flag:sensitive`,
            value: 'TRUE',
          },
        ]);
      });
    });
    describe('--force', () => {
      it('tracks flag', async () => {
        client.setArgv(
          'env',
          'add',
          'FORCE_FLAG',
          'preview',
          'branchName',
          '--force'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput("What's the value of FORCE_FLAG?");
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: 'preview',
          },
          {
            key: `argument:git-branch`,
            value: '[REDACTED]',
          },
          {
            key: `flag:force`,
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--guidance', () => {
      it('tracks telemetry', async () => {
        client.setArgv(
          'env',
          'add',
          'FORCE_FLAG',
          'preview',
          'branchName',
          '--force',
          '--guidance'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput("What's the value of FORCE_FLAG?");
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: 'preview',
          },
          {
            key: `argument:git-branch`,
            value: '[REDACTED]',
          },
          {
            key: `flag:force`,
            value: 'TRUE',
          },
          {
            key: `flag:guidance`,
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('[environment]', () => {
      it('should redact custom [environment] values', async () => {
        client.setArgv('env', 'add', 'environment-variable', 'custom-env-name');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of environment-variable?"
        );
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: '[REDACTED]',
          },
        ]);
      });

      describe('[gitBranch]', () => {
        it('should allow `gitBranch` to be passed', async () => {
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
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "env"').toEqual(0);
        });

        it('tracks telemetry events', async () => {
          client.setArgv(
            'env',
            'add',
            'TELEMETRY_EVENTS',
            'preview',
            'branchName'
          );
          const exitCodePromise = env(client);
          await expect(client.stderr).toOutput(
            "What's the value of TELEMETRY_EVENTS?"
          );
          client.stdin.write('testvalue\n');
          await expect(exitCodePromise).resolves.toEqual(0);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: `subcommand:add`,
              value: 'add',
            },
            {
              key: `argument:name`,
              value: '[REDACTED]',
            },
            {
              key: `argument:environment`,
              value: 'preview',
            },
            {
              key: `argument:git-branch`,
              value: '[REDACTED]',
            },
          ]);
        });
      });
    });
  });
});

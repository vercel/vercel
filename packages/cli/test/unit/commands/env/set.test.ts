import { describe, expect, it, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env set', () => {
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
          id: 'test-env-id-123',
          key: 'EXISTING_VAR',
          value: 'existing-value',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
          customEnvironmentIds: [],
        },
      ]
    );
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'set';

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
          'set',
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
            key: `subcommand:set`,
            value: 'set',
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

    describe('--guidance', () => {
      it('tracks telemetry', async () => {
        client.setArgv(
          'env',
          'set',
          'NEW_VAR',
          'preview',
          'branchName',
          '--sensitive',
          '--guidance'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput("What's the value of NEW_VAR?");
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:set`,
            value: 'set',
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
          {
            key: `flag:guidance`,
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('[environment]', () => {
      it('should redact custom [environment] values', async () => {
        client.setArgv('env', 'set', 'environment-variable', 'custom-env-name');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput(
          "What's the value of environment-variable?"
        );
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:set`,
            value: 'set',
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
          client.setArgv('env', 'set', 'NEW_VAR', 'preview', 'branchName');
          const exitCodePromise = env(client);
          // When target and git branch are specified, skip the sensitivity prompt
          // and go directly to asking for the value
          await expect(client.stderr).toOutput("What's the value of NEW_VAR?");
          client.stdin.write('testvalue\n');
          // Accept either "Added" or "Updated" since set is an upsert operation
          await expect(client.stderr).toOutput(
            'Environment Variable NEW_VAR to Project vercel-env-pull'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "env set"').toEqual(0);
        });

        it('tracks telemetry events', async () => {
          client.setArgv(
            'env',
            'set',
            'TELEMETRY_EVENTS',
            'preview',
            'branchName'
          );
          const exitCodePromise = env(client);
          // When target and git branch are specified, skip the sensitivity prompt
          await expect(client.stderr).toOutput(
            "What's the value of TELEMETRY_EVENTS?"
          );
          client.stdin.write('testvalue\n');
          await expect(exitCodePromise).resolves.toEqual(0);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: `subcommand:set`,
              value: 'set',
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

  describe('upsert behavior', () => {
    it('should update an existing environment variable (upsert)', async () => {
      client.setArgv('env', 'set', 'EXISTING_VAR', 'production');
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput("What's the value of EXISTING_VAR?");
      client.stdin.write('updated-value\n');

      await expect(client.stderr).toOutput(
        'Updated Environment Variable EXISTING_VAR to Project vercel-env-pull'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "env set"').toEqual(0);
    });

    it('should create a new environment variable when it does not exist', async () => {
      client.setArgv(
        'env',
        'set',
        'BRAND_NEW_VAR',
        'preview',
        'feature-branch'
      );
      const exitCodePromise = env(client);

      // When target and git branch are explicitly specified, skip the sensitivity prompt
      await expect(client.stderr).toOutput(
        "What's the value of BRAND_NEW_VAR?"
      );
      client.stdin.write('new-value\n');

      // Accept either "Added" or "Updated" since set is an upsert operation
      await expect(client.stderr).toOutput(
        'Environment Variable BRAND_NEW_VAR to Project vercel-env-pull'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "env set"').toEqual(0);
    });
  });

  it('should show error with invalid number of arguments', async () => {
    client.setArgv('env', 'set', 'VAR1', 'production', 'branch', 'extra');
    const exitCodePromise = env(client);

    await expect(client.stderr).toOutput('Invalid number of arguments');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env set"').toEqual(1);
  });
});

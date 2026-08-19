import { describe, it, expect, beforeEach, vi } from 'vitest';
import env from '../../../../src/commands/env';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
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

  it('removes a variable from the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject(
      {
        ...defaultProject,
        id: 'explicit-env-rm',
        name: 'explicit-env-rm',
        accountId: 'team_dummy',
      },
      [
        {
          type: 'encrypted',
          id: 'explicit-env',
          key: 'ENVIRONMENT_NAME',
          value: 'value',
          target: ['development'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    client.setArgv(
      'env',
      'rm',
      'ENVIRONMENT_NAME',
      'development',
      '--yes',
      '--project',
      'explicit-env-rm'
    );

    await expect(env(client)).resolves.toEqual(0);
  });

  it('warns that deleting a credential-like variable does not revoke it', async () => {
    const originalFlag = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
    process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = '1';
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject(
      {
        ...defaultProject,
        id: 'explicit-secret-rm',
        name: 'explicit-secret-rm',
        accountId: 'team_dummy',
      },
      [
        {
          type: 'sensitive',
          visibility: 'secret',
          id: 'secret-rm-id',
          key: 'STRIPE_SECRET_KEY',
          value: '',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    try {
      client.setArgv(
        'env',
        'rm',
        'STRIPE_SECRET_KEY',
        '--yes',
        '--project',
        'explicit-secret-rm'
      );
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'Removing this variable from Vercel does not revoke the credential'
      );
      await expect(exitCodePromise).resolves.toBe(0);
    } finally {
      if (originalFlag === undefined) {
        delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
      } else {
        process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = originalFlag;
      }
    }
  });

  it('does not add credential-rotation guidance when Config/Secret is disabled', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject(
      {
        ...defaultProject,
        id: 'explicit-legacy-rm',
        name: 'explicit-legacy-rm',
        accountId: 'team_dummy',
      },
      [
        {
          type: 'sensitive',
          id: 'legacy-rm-id',
          key: 'STRIPE_SECRET_KEY',
          value: '',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    client.setArgv(
      'env',
      'rm',
      'STRIPE_SECRET_KEY',
      '--yes',
      '--project',
      'explicit-legacy-rm'
    );
    await expect(env(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain(
      'does not revoke the credential'
    );
  });

  describe('non-interactive', () => {
    it('outputs action_required with missing_name when name not provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.nonInteractive = true;
      client.setArgv(
        'env',
        'rm',
        '--non-interactive',
        '--cwd=../../../test-custom-deployment-id'
      );
      const exitCodePromise = env(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_name',
        message: expect.stringMatching(/name|Example/),
        next: expect.any(Array),
      });
      expect(payload.next[0].command).toMatch(/env rm/);
      expect(payload.next[0].command).toContain('--yes');
      expect(payload.next[0].command).toContain('--non-interactive');

      exitSpy.mockRestore();
      logSpy.mockRestore();
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

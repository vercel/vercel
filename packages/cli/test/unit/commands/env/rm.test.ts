import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('multi-environment record scoping', () => {
  describe('when a record targets multiple environments', () => {
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
            id: 'multi-env-id-123',
            key: 'MULTI_ENV_VAR',
            value: 'secret',
            target: ['production', 'preview'],
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

    it('PATCHes the record instead of DELETEing when a specific target is given', async () => {
      const detargetModule = await import(
        '../../../../src/util/env/detarget-env-record'
      );
      const detargetSpy = vi
        .spyOn(detargetModule, 'default')
        .mockResolvedValue(undefined);

      const removeModule = await import(
        '../../../../src/util/env/remove-env-record'
      );
      const removeSpy = vi
        .spyOn(removeModule, 'default')
        .mockResolvedValue(undefined);

      client.setArgv('env', 'rm', 'MULTI_ENV_VAR', 'preview', '--yes');
      const exitCode = await env(client);

      expect(exitCode).toBe(0);
      expect(detargetSpy).toHaveBeenCalledOnce();
      expect(removeSpy).not.toHaveBeenCalled();

      const [, , envArg, targetArg] = detargetSpy.mock.calls[0] as Parameters<
        typeof detargetModule.default
      >;
      expect(envArg.key).toBe('MULTI_ENV_VAR');
      expect(targetArg).toBe('preview');

      detargetSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('DELETEs the record when no specific target is given', async () => {
      const detargetModule = await import(
        '../../../../src/util/env/detarget-env-record'
      );
      const detargetSpy = vi
        .spyOn(detargetModule, 'default')
        .mockResolvedValue(undefined);

      const removeModule = await import(
        '../../../../src/util/env/remove-env-record'
      );
      const removeSpy = vi
        .spyOn(removeModule, 'default')
        .mockResolvedValue(undefined);

      client.setArgv('env', 'rm', 'MULTI_ENV_VAR', '--yes');
      const exitCode = await env(client);

      expect(exitCode).toBe(0);
      expect(removeSpy).toHaveBeenCalledOnce();
      expect(detargetSpy).not.toHaveBeenCalled();

      detargetSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});

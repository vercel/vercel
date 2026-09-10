import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import env from '../../../../src/commands/env';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { omitUnavailableSecretPlaceholders } from '../../../../src/commands/env/run';

// Mock execa to verify env vars are passed correctly
vi.mock('execa', () => ({
  default: vi.fn().mockResolvedValue({ exitCode: 0 }),
}));

import execa from 'execa';

describe('env run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'run';

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

    it('does not show help when --help is after --', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      client.setArgv('env', 'run', '--', 'node', '--help');
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput('Downloading');
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Should track subcommand, not help
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:run',
          value: 'run',
        },
      ]);
    });
  });

  describe('errors', () => {
    it('should error when no command is provided', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      client.setArgv('env', 'run');
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        'No command provided. Use `--` to separate vercel flags from your command.'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });

    it('returns structured guidance when a command is missing in non-interactive mode', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      client.nonInteractive = true;
      client.setArgv('env', 'run', '--non-interactive');

      await expect(env(client)).rejects.toThrow('exit');
      expect(JSON.parse(logSpy.mock.calls.at(-1)?.[0])).toMatchObject({
        status: 'action_required',
        reason: 'missing_command',
        next: [{ command: expect.stringContaining('env run -- <command>') }],
      });

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('should error when no command after --', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      client.setArgv('env', 'run', '--');
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        'No command provided. Use `--` to separate vercel flags from your command.'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });

    it('should error when project is not linked', async () => {
      useUser();
      const cwd = setupUnitFixture('vercel-pull-unlinked');
      client.cwd = cwd;

      client.setArgv('env', 'run', '--', 'echo', 'hello');
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        "Your codebase isn't linked to a project on Vercel"
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });

    it('returns structured link guidance when unlinked in non-interactive mode', async () => {
      useUser();
      useTeams('team_dummy');
      client.cwd = setupUnitFixture('vercel-pull-unlinked');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      client.nonInteractive = true;
      client.setArgv(
        'env',
        'run',
        '--non-interactive',
        '--',
        'node',
        'script.js'
      );

      await expect(env(client)).rejects.toThrow('exit');
      expect(JSON.parse(logSpy.mock.calls.at(-1)?.[0])).toMatchObject({
        status: 'action_required',
        reason: 'not_linked',
        next: [{ command: expect.stringContaining('vercel link') }],
      });

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('running commands', () => {
    it('runs with variables from the project selected by --project', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
        accountId: 'team_dummy',
      });
      client.cwd = setupTmpDir();
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'env',
        'run',
        '--project',
        'vercel-env-pull',
        '--',
        'echo',
        'hello'
      );

      await expect(env(client)).resolves.toEqual(0);
      expect(execa).toHaveBeenCalledWith(
        'echo',
        ['hello'],
        expect.objectContaining({ cwd: client.cwd })
      );
    });

    it('ignores scope flags passed to the child command', async () => {
      useUser();
      useTeams('team_dummy');
      const project = {
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
        accountId: 'team_dummy',
      };
      let requestedTeamId: unknown;

      client.scenario.get('/v9/projects/vercel-env-pull', (req, res) => {
        requestedTeamId = req.query.teamId;
        if (requestedTeamId !== 'team_dummy') {
          res.status(404).send();
          return;
        }
        res.json(project);
      });
      useProject(project);

      client.cwd = setupUnitFixture('vercel-env-pull');
      client.config.currentTeam = 'team_current';
      client.setArgv(
        'env',
        'run',
        '--project',
        'vercel-env-pull',
        '--',
        'child',
        '--scope',
        'child-scope'
      );

      await expect(env(client)).resolves.toEqual(0);
      expect(requestedTeamId).toEqual('team_dummy');
      expect(execa).toHaveBeenCalledWith(
        'child',
        ['--scope', 'child-scope'],
        expect.objectContaining({ cwd: client.cwd })
      );
    });

    it('should run command with development env vars by default', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      client.setArgv('env', 'run', '--', 'echo', 'hello');
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        'Downloading `development` environment variables'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify execa was called with env vars
      expect(execa).toHaveBeenCalledWith('echo', ['hello'], {
        cwd,
        stdio: 'inherit',
        reject: false,
        env: expect.objectContaining({
          SPECIAL_FLAG: '1',
        }),
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:run',
          value: 'run',
        },
      ]);
    });

    it('should run command with specified environment', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      client.setArgv(
        'env',
        'run',
        '-e',
        'production',
        '--',
        'node',
        'script.js'
      );
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        'Downloading `production` environment variables'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify execa was called with production env vars
      expect(execa).toHaveBeenCalledWith('node', ['script.js'], {
        cwd,
        stdio: 'inherit',
        reject: false,
        env: expect.objectContaining({
          REDIS_CONNECTION_STRING: 'redis://abc123@redis.example.com:6379',
          SQL_CONNECTION_STRING:
            'Server=sql.example.com;Database=app;Uid=root;Pwd=P455W0RD;',
        }),
      });
    });

    it('should run command with preview env vars and git branch', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      client.setArgv(
        'env',
        'run',
        '-e',
        'preview',
        '--git-branch',
        'feat/awesome-thing',
        '--',
        'npm',
        'test'
      );
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        'Downloading `preview` environment variables'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify execa was called with preview + branch env vars
      expect(execa).toHaveBeenCalledWith('npm', ['test'], {
        cwd,
        stdio: 'inherit',
        reject: false,
        env: expect.objectContaining({
          REDIS_CONNECTION_STRING: 'redis://abc123@redis.example.com:6379',
          BRANCH_ENV_VAR: 'env var for a specific branch',
          ANOTHER: 'one',
        }),
      });
    });

    it('should return the exit code from the child process', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      // Mock execa to return exit code 42
      vi.mocked(execa).mockResolvedValueOnce({ exitCode: 42 } as any);

      client.setArgv('env', 'run', '--', 'failing-command');
      const exitCode = await env(client);

      expect(exitCode).toEqual(42);
    });

    it.each([
      [
        undefined,
        'visibility-only Secret',
        { type: 'encrypted', visibility: 'secret' },
      ],
      [undefined, 'legacy sensitive Secret', { type: 'sensitive' }],
      [
        '0',
        'visibility-only Secret',
        { type: 'encrypted', visibility: 'secret' },
      ],
      ['0', 'legacy sensitive Secret', { type: 'sensitive' }],
      [
        '1',
        'visibility-only Secret',
        { type: 'encrypted', visibility: 'secret' },
      ],
      ['1', 'legacy sensitive Secret', { type: 'sensitive' }],
    ] as const)('warns about unavailable Production Secrets when the retired local override is %s using a %s record', async (featureFlag, _recordKind, secretShape) => {
      const originalFlag = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
      const originalSecret = process.env.RUN_ONLY_SECRET;
      try {
        if (featureFlag === undefined) {
          delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        } else {
          process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = featureFlag;
        }
        delete process.env.RUN_ONLY_SECRET;
        useUser();
        useTeams('team_dummy');
        useProject(
          {
            ...defaultProject,
            id: 'env-run-sensitive',
            name: 'env-run-sensitive',
            accountId: 'team_dummy',
          },
          [
            {
              ...secretShape,
              id: 'sensitive-run-id',
              key: 'RUN_ONLY_SECRET',
              value: '',
              target: ['production'],
              gitBranch: undefined,
              configurationId: null,
              updatedAt: 1557241361455,
              createdAt: 1557241361455,
            },
          ]
        );
        client.cwd = setupTmpDir();
        client.config.currentTeam = 'team_dummy';
        client.setArgv(
          'env',
          'run',
          '--project',
          'env-run-sensitive',
          '--environment',
          'production',
          '--',
          'echo',
          'hello'
        );

        await expect(env(client)).resolves.toBe(0);
        expect(client.stderr.getFullOutput()).toContain(
          '1 Secret value cannot be pulled from the `production` Environment. Define it in a local .env file.'
        );
      } finally {
        if (originalFlag === undefined) {
          delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        } else {
          process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = originalFlag;
        }
        if (originalSecret === undefined) {
          delete process.env.RUN_ONLY_SECRET;
        } else {
          process.env.RUN_ONLY_SECRET = originalSecret;
        }
      }
    });

    it('does not pass a process-env redaction placeholder to the child command', async () => {
      const originalSecret = process.env.RUN_ONLY_SECRET;
      try {
        process.env.RUN_ONLY_SECRET = '[SENSITIVE]';
        useUser();
        useTeams('team_dummy');
        useProject(
          {
            ...defaultProject,
            id: 'env-run-process-placeholder',
            name: 'env-run-process-placeholder',
            accountId: 'team_dummy',
          },
          [
            {
              type: 'sensitive',
              id: 'process-placeholder-secret-id',
              key: 'RUN_ONLY_SECRET',
              value: '',
              target: ['production'],
              gitBranch: undefined,
              configurationId: null,
              updatedAt: 1557241361455,
              createdAt: 1557241361455,
            },
          ]
        );
        client.cwd = setupTmpDir();
        client.config.currentTeam = 'team_dummy';
        client.setArgv(
          'env',
          'run',
          '--project',
          'env-run-process-placeholder',
          '--environment',
          'production',
          '--',
          'echo',
          'hello'
        );

        await expect(env(client)).resolves.toBe(0);
        expect(client.stderr.getFullOutput()).toContain(
          '1 Secret value cannot be pulled from the `production` Environment'
        );
        expect(execa).toHaveBeenCalledWith(
          'echo',
          ['hello'],
          expect.objectContaining({
            env: expect.not.objectContaining({
              RUN_ONLY_SECRET: '[SENSITIVE]',
            }),
          })
        );
      } finally {
        if (originalSecret === undefined) {
          delete process.env.RUN_ONLY_SECRET;
        } else {
          process.env.RUN_ONLY_SECRET = originalSecret;
        }
      }
    });

    it.each([
      ['visibility-only Secret', { type: 'encrypted', visibility: 'secret' }],
      ['legacy sensitive Secret', { type: 'sensitive' }],
    ] as const)('passes a returned Development value to the child command using a %s record', async (_recordKind, secretShape) => {
      const secretKey =
        secretShape.type === 'sensitive'
          ? 'RETURNED_LEGACY_DEV_SECRET_TEST'
          : 'RETURNED_VISIBILITY_DEV_SECRET_TEST';
      const originalSecret = process.env[secretKey];
      try {
        delete process.env[secretKey];
        useUser();
        useTeams('team_dummy');
        useProject(
          {
            ...defaultProject,
            id: 'env-run-development-secret',
            name: 'env-run-development-secret',
            accountId: 'team_dummy',
          },
          [
            {
              ...secretShape,
              id: 'returned-development-secret-id',
              key: secretKey,
              value: 'development-secret-value',
              target: ['development'],
              gitBranch: undefined,
              configurationId: null,
              updatedAt: 1557241361455,
              createdAt: 1557241361455,
            },
          ],
          { decryptDevelopmentSecrets: true }
        );
        client.cwd = setupTmpDir();
        await fs.writeFile(
          path.join(client.cwd, '.env.local'),
          `${secretKey}="[SENSITIVE]"\n`
        );
        client.config.currentTeam = 'team_dummy';
        client.setArgv(
          'env',
          'run',
          '--project',
          'env-run-development-secret',
          '--',
          'echo',
          'hello'
        );

        await expect(env(client)).resolves.toBe(0);
        expect(execa).toHaveBeenCalledWith(
          'echo',
          ['hello'],
          expect.objectContaining({
            env: expect.objectContaining({
              [secretKey]: 'development-secret-value',
            }),
          })
        );
        expect(client.stderr.getFullOutput()).not.toContain(
          'not returned by Vercel'
        );
      } finally {
        if (originalSecret === undefined) {
          delete process.env[secretKey];
        } else {
          process.env[secretKey] = originalSecret;
        }
      }
    });

    it('uses neutral guidance when a Development Secret is not returned', async () => {
      const originalSecret = process.env.UNAVAILABLE_DEV_SECRET_TEST;
      try {
        delete process.env.UNAVAILABLE_DEV_SECRET_TEST;
        useUser();
        useTeams('team_dummy');
        useProject(
          {
            ...defaultProject,
            id: 'env-run-unavailable-development-secret',
            name: 'env-run-unavailable-development-secret',
            accountId: 'team_dummy',
          },
          [
            {
              type: 'encrypted',
              visibility: 'secret',
              id: 'unavailable-development-secret-id',
              key: 'UNAVAILABLE_DEV_SECRET_TEST',
              value: '',
              target: ['development'],
              gitBranch: undefined,
              configurationId: null,
              updatedAt: 1557241361455,
              createdAt: 1557241361455,
            },
          ]
        );
        client.cwd = setupTmpDir();
        client.config.currentTeam = 'team_dummy';
        client.setArgv(
          'env',
          'run',
          '--project',
          'env-run-unavailable-development-secret',
          '--',
          'echo',
          'hello'
        );

        await expect(env(client)).resolves.toBe(0);
        expect(client.stderr.getFullOutput()).toContain(
          '1 Development Secret value was not returned by Vercel. Define it in a local .env file.'
        );
        expect(execa).toHaveBeenCalledWith(
          'echo',
          ['hello'],
          expect.objectContaining({
            env: expect.not.objectContaining({
              UNAVAILABLE_DEV_SECRET_TEST: '[SENSITIVE]',
            }),
          })
        );
      } finally {
        if (originalSecret === undefined) {
          delete process.env.UNAVAILABLE_DEV_SECRET_TEST;
        } else {
          process.env.UNAVAILABLE_DEV_SECRET_TEST = originalSecret;
        }
      }
    });

    it('removes placeholders only for confirmed Secret keys', () => {
      const localEnv = {
        SECRET_VALUE: '[SENSITIVE]',
        CONFIG_VALUE: '[SENSITIVE]',
      };

      expect(
        omitUnavailableSecretPlaceholders(localEnv, ['SECRET_VALUE'])
      ).toEqual({ CONFIG_VALUE: '[SENSITIVE]' });
      expect(localEnv).toEqual({
        SECRET_VALUE: '[SENSITIVE]',
        CONFIG_VALUE: '[SENSITIVE]',
      });
    });

    it('continues when Secret metadata cannot be loaded', async () => {
      const getEnvRecordsModule = await import(
        '../../../../src/util/env/get-env-records'
      );
      const getEnvRecordsSpy = vi
        .spyOn(getEnvRecordsModule, 'default')
        .mockRejectedValueOnce(new Error('metadata unavailable'));
      const originalSecret = process.env.RUN_ONLY_SECRET;
      delete process.env.RUN_ONLY_SECRET;
      useUser();
      useTeams('team_dummy');
      useProject(
        {
          ...defaultProject,
          id: 'env-run-metadata-error',
          name: 'env-run-metadata-error',
          accountId: 'team_dummy',
        },
        [
          {
            type: 'sensitive',
            visibility: 'secret',
            id: 'sensitive-run-id',
            key: 'RUN_ONLY_SECRET',
            value: '',
            target: ['development'],
            gitBranch: undefined,
            configurationId: null,
            updatedAt: 1557241361455,
            createdAt: 1557241361455,
          },
        ]
      );
      client.cwd = setupTmpDir();
      await fs.writeFile(
        path.join(client.cwd, '.env.local'),
        'RUN_ONLY_SECRET="[SENSITIVE]"\n'
      );
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'env',
        'run',
        '--project',
        'env-run-metadata-error',
        '--',
        'echo',
        'hello'
      );

      try {
        await expect(env(client)).resolves.toBe(0);
        expect(execa).toHaveBeenCalledWith(
          'echo',
          ['hello'],
          expect.objectContaining({
            env: expect.not.objectContaining({
              RUN_ONLY_SECRET: '[SENSITIVE]',
            }),
          })
        );
      } finally {
        getEnvRecordsSpy.mockRestore();
        if (originalSecret === undefined) {
          delete process.env.RUN_ONLY_SECRET;
        } else {
          process.env.RUN_ONLY_SECRET = originalSecret;
        }
      }
    });
  });
});

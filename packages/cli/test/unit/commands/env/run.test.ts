import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import env from '../../../../src/commands/env';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

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
  });
});

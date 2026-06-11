import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

// Mock execa so we can inspect the env that would have been passed.
vi.mock('execa', () => ({
  default: vi.fn().mockResolvedValue({ exitCode: 0 }),
}));

import execa from 'execa';

// Plain dummy used for non-URL secrets.
const DUMMY_RE = /^vbroker_[a-z0-9_]+_[0-9a-f]{20}_xx$/;
// URL-shaped dummy used when the real secret starts with a `scheme://` so
// client-side URL validators (libsql, pg, redis, ...) don't reject it.
const URL_DUMMY_RE =
  /^[a-z][a-z0-9+.-]*:\/\/vbroker-[a-z0-9-]+-[0-9a-f]{20}\.xx$/;

describe('env run --experimental', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('errors', () => {
    it('errors when no command is provided', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      client.setArgv('env', 'run', '--experimental');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'No command provided. Use `--` to separate vercel flags from your command.'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('errors when project is not linked', async () => {
      useUser();
      const cwd = setupUnitFixture('vercel-pull-unlinked');
      client.cwd = cwd;

      client.setArgv('env', 'run', '--experimental', '--', 'echo', 'hi');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        "Your codebase isn't linked to a project on Vercel"
      );
      expect(await exitCodePromise).toEqual(1);
    });
  });

  describe('running commands', () => {
    it('uses brokered env vars for env run --experimental', async () => {
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
        '--experimental',
        '-e',
        'production',
        '--',
        'next',
        'dev'
      );
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        'Downloading `production` Environment Variables'
      );
      expect(await exitCodePromise).toEqual(0);

      expect(execa).toHaveBeenCalledTimes(1);
      const [cmd, args, opts] = (execa as any).mock.calls[0];
      expect(cmd).toBe('next');
      expect(args).toEqual(['dev']);
      expect(opts.env.REDIS_CONNECTION_STRING).toMatch(URL_DUMMY_RE);
      expect(opts.env.SQL_CONNECTION_STRING).toMatch(DUMMY_RE);
      expect(opts.env.NODE_OPTIONS).toMatch(/--require .*broker-shim\.cjs/);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:run', value: 'run' },
      ]);
    });

    it('passes dummy values, not real values, to the subprocess', async () => {
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
        '--experimental',
        '-e',
        'production',
        '--',
        'node',
        'script.js'
      );
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        'Downloading `production` Environment Variables'
      );
      expect(await exitCodePromise).toEqual(0);

      expect(execa).toHaveBeenCalledTimes(1);
      const callArgs = (execa as any).mock.calls[0];
      const [cmd, args, opts] = callArgs;
      expect(cmd).toBe('node');
      expect(args).toEqual(['script.js']);
      const passedEnv = opts.env;

      // The brokered secrets must be dummies, not real values. The Redis
      // value is URL-shaped so the dummy mirrors the `redis://` scheme; the
      // SQL connection string is not URL-shaped so it gets the plain dummy.
      expect(passedEnv.REDIS_CONNECTION_STRING).toMatch(URL_DUMMY_RE);
      expect(passedEnv.REDIS_CONNECTION_STRING).toMatch(/^redis:\/\//);
      expect(passedEnv.REDIS_CONNECTION_STRING).not.toBe(
        'redis://abc123@redis.example.com:6379'
      );
      expect(passedEnv.SQL_CONNECTION_STRING).toMatch(DUMMY_RE);
      expect(passedEnv.SQL_CONNECTION_STRING).not.toContain('P455W0RD');

      // The shim coordinates: broker URL, session ID, and --require shim.
      expect(passedEnv.VC_ENV_BROKER_URL).toMatch(
        /^http:\/\/127\.0\.0\.1:\d+$/
      );
      expect(passedEnv.VC_ENV_BROKER_LOCAL_TOKEN).toMatch(/^[0-9a-f]{32}$/);
      expect(passedEnv.NODE_OPTIONS).toMatch(/--require .*broker-shim\.cjs/);
    });

    it('defaults to development environment', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      client.setArgv('env', 'run', '--experimental', '--', 'node', 'script.js');
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables'
      );
      expect(await exitCodePromise).toEqual(0);
    });

    it('returns the subprocess exit code', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      });
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;

      vi.mocked(execa).mockResolvedValueOnce({ exitCode: 42 } as any);

      client.setArgv('env', 'run', '--experimental', '--', 'failing');
      const exitCode = await env(client);
      expect(exitCode).toEqual(42);
    });
  });
});

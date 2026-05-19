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
const DUMMY_RE = /^vproxy_[a-z0-9_]+_[0-9a-f]{20}_xx$/;
// URL-shaped dummy used when the real secret starts with a `scheme://` so
// client-side URL validators (libsql, pg, redis, ...) don't reject it.
const URL_DUMMY_RE =
  /^[a-z][a-z0-9+.-]*:\/\/vproxy-[a-z0-9-]+-[0-9a-f]{20}\.xx$/;

describe('env proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('env', 'proxy', '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'env:proxy' },
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

      client.setArgv('env', 'proxy', '--', 'node', '--help');
      const exitCodePromise = env(client);

      await expect(client.stderr).toOutput('Downloading');
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:proxy', value: 'proxy' },
      ]);
    });
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

      client.setArgv('env', 'proxy');
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

      client.setArgv('env', 'proxy', '--', 'echo', 'hi');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        "Your codebase isn't linked to a project on Vercel"
      );
      expect(await exitCodePromise).toEqual(1);
    });
  });

  describe('running commands', () => {
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
        'proxy',
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
      expect(passedEnv.VC_ENV_PROXY_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(passedEnv.VC_ENV_PROXY_SESSION).toMatch(/^[0-9a-f]{32}$/);
      expect(passedEnv.NODE_OPTIONS).toMatch(/--require .*proxy-shim\.cjs/);
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

      client.setArgv('env', 'proxy', '--', 'node', 'script.js');
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

      client.setArgv('env', 'proxy', '--', 'failing');
      const exitCode = await env(client);
      expect(exitCode).toEqual(42);
    });
  });
});

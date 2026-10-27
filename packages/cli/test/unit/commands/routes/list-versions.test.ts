import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import routes from '../../../../src/commands/routes';
import { useUser } from '../../../mocks/user';
import { useRouteVersions } from '../../../mocks/routes';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

describe('routes list-versions', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'routes-test-project',
      name: 'routes-test',
    });
    const cwd = setupUnitFixture('commands/routes');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'routes';
      const subcommand = 'list-versions';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = routes(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should list route versions', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'list-versions');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list-versions"').toEqual(0);
    await expect(client.stderr).toOutput('Route versions for');
  });

  it('should list route versions using ls-versions alias', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'ls-versions');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes ls-versions"').toEqual(0);
    await expect(client.stderr).toOutput('Route versions for');
  });

  it('tracks subcommand invocation', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'list-versions');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list-versions"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list-versions',
        value: 'list-versions',
      },
    ]);
  });

  it('tracks subcommand invocation with alias', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'ls-versions');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes ls-versions"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list-versions',
        value: 'ls-versions',
      },
    ]);
  });

  it('should show empty state when no versions', async () => {
    useRouteVersions(0);
    client.setArgv('routes', 'list-versions');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for empty versions').toEqual(0);
    await expect(client.stderr).toOutput('No versions found');
  });

  it('should show staging version status', async () => {
    useRouteVersions(3);
    client.setArgv('routes', 'list-versions');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list-versions"').toEqual(0);
    await expect(client.stderr).toOutput('Staging');
  });

  it('should show live version status', async () => {
    useRouteVersions(3);
    client.setArgv('routes', 'list-versions');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list-versions"').toEqual(0);
    await expect(client.stderr).toOutput('Live');
  });

  it('should show previous version status', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'list-versions');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list-versions"').toEqual(0);
    await expect(client.stderr).toOutput('Previous');
  });

  it('should accept --count flag', async () => {
    useRouteVersions(10);
    client.setArgv('routes', 'list-versions', '--count', '5');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list-versions --count"').toEqual(0);
    await expect(client.stderr).toOutput('Route versions for');
  });

  it('should reject invalid count (too low)', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'list-versions', '--count', '0');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for invalid count').toEqual(2);
    await expect(client.stderr).toOutput('Count must be between 1 and 100');
  });

  it('should reject invalid count (too high)', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'list-versions', '--count', '150');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for invalid count').toEqual(2);
    await expect(client.stderr).toOutput('Count must be between 1 and 100');
  });

  it('writes versions to stdout with --json', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'list-versions', '--json');

    expect(await routes(client)).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.versions).toHaveLength(5);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('Fetching route versions');
    expect(stderr).not.toContain('Route versions for');
  });

  describe('renamed options', () => {
    async function run(...args: string[]) {
      client.reset();
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'routes-test-project',
        name: 'routes-test',
      });
      client.cwd = setupUnitFixture('commands/routes');
      let query: Record<string, unknown> | undefined;
      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (req, res) => {
          query = req.query;
          res.json({ versions: [] });
        }
      );
      client.setArgv('routes', 'list-versions', ...args);
      const exitCode = await routes(client);
      return {
        exitCode,
        query,
        stdout: client.stdout.getFullOutput(),
        stderr: client.stderr.getFullOutput(),
      };
    }

    it('still accepts --count, with one warning that names --limit', async () => {
      const now = await run('--limit', '5');
      const before = await run('--count', '5');

      expect(now.exitCode).toBe(0);
      expect(now.query).toMatchObject({ count: '5' });
      expect(now.stderr).not.toContain('deprecated');
      expect(before.exitCode).toBe(0);
      expect(before.query).toEqual(now.query);
      expect(before.stdout).toBe(now.stdout);
      expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
      expect(before.stderr).toContain(
        '! --count is deprecated. Use --limit.\n'
      );

      const nowJson = await run('--limit', '5', '--json');
      const beforeJson = await run('--count', '5', '--json');
      expectDeprecationInJson(
        beforeJson.stdout,
        nowJson.stdout,
        '--count is deprecated. Use --limit.'
      );
      expect(beforeJson.stderr).not.toContain('deprecated');
    });

    it('rejects --count 0 as before', async () => {
      const result = await run('--count', '0');

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Count must be between 1 and 100');
      expect(result.query).toBeUndefined();
    });

    it('rejects --limit with --count before any request', async () => {
      const result = await run('--limit', '5', '--count', '5');

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Can't use --limit with --count.");
      expect(result.query).toBeUndefined();
    });
  });
});

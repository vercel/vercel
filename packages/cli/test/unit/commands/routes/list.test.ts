import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import routes from '../../../../src/commands/routes';
import { getUsedDeprecatedShorthands } from '../../../../src/util/get-args';
import { useUser } from '../../../mocks/user';
import {
  useRoutes,
  useRouteVersions,
  useRoutesWithDiff,
} from '../../../mocks/routes';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

describe('routes list', () => {
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
      const subcommand = 'list';

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

  it('should list routes', async () => {
    useRoutes(3);
    client.setArgv('routes', 'list');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list"').toEqual(0);
    await expect(client.stderr).toOutput('3 Routes found');
  });

  it('lists routes for the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'explicit-routes',
      name: 'explicit-routes',
      accountId: 'team_dummy',
    });
    useRoutes(3);
    client.setArgv('routes', 'list', '--project', 'explicit-routes');

    await expect(routes(client)).resolves.toEqual(0);
    await expect(client.stderr).toOutput('3 Routes found');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'subcommand:list', value: 'list' },
    ]);
  });

  it('should list routes using ls alias', async () => {
    useRoutes(2);
    client.setArgv('routes', 'ls');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes ls"').toEqual(0);
    await expect(client.stderr).toOutput('2 Routes found');
  });

  it('tracks subcommand invocation', async () => {
    useRoutes(3);
    client.setArgv('routes', 'list');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'list',
      },
    ]);
  });

  it('tracks subcommand invocation with alias', async () => {
    useRoutes(3);
    client.setArgv('routes', 'ls');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes ls"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'ls',
      },
    ]);
  });

  it('should show empty state when no routes', async () => {
    useRoutes(0);
    client.setArgv('routes', 'list');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list"').toEqual(0);
    await expect(client.stderr).toOutput('0 Routes found');
  });

  it('should show draft indicator for staged routes', async () => {
    useRoutes(3); // Route 1 is staged (index % 5 === 1)
    client.setArgv('routes', 'list');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list"').toEqual(0);
    await expect(client.stderr).toOutput('(draft)');
  });

  it('should search routes with --search flag', async () => {
    useRoutes(5);
    client.setArgv('routes', 'list', '--search', 'path-1');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list --search"').toEqual(0);
    await expect(client.stderr).toOutput('matching "path-1"');
  });

  it('should filter routes with --filter flag', async () => {
    useRoutes(5);
    client.setArgv('routes', 'list', '--filter', 'redirect');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list --filter"').toEqual(0);
    await expect(client.stderr).toOutput('filtered by redirect');
  });

  it('should reject invalid filter type', async () => {
    useRoutes(5);
    client.setArgv('routes', 'list', '--filter', 'invalid');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for invalid filter').toEqual(2);
    await expect(client.stderr).toOutput('Invalid filter type');
  });

  it('should show staged changes with --diff flag', async () => {
    useRouteVersions(3);
    useRoutesWithDiff();
    client.setArgv('routes', 'list', '--diff');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list --diff"').toEqual(0);
    await expect(client.stderr).toOutput('Changes in staging version');
  });

  it('should show diff with added/removed/modified routes', async () => {
    useRouteVersions(3);
    useRoutesWithDiff();
    client.setArgv('routes', 'list', '--diff');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list --diff"').toEqual(0);
    await expect(client.stderr).toOutput('Added (1)');
  });

  it('should error when --diff is used but no staging version exists', async () => {
    useRouteVersions(0);
    useRoutes(3);
    client.setArgv('routes', 'list', '--diff');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for --diff without staging').toEqual(1);
    await expect(client.stderr).toOutput('No staged changes to diff');
  });

  it('preserves --project in suggestions when no staging version exists', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as () => never);
    client.nonInteractive = true;
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'explicit-routes',
      name: 'explicit-routes',
      accountId: 'team_dummy',
    });
    useRouteVersions(0);
    useRoutes(3);
    client.setArgv('routes', 'list', '--diff', '--project', 'explicit-routes');

    await expect(routes(client)).rejects.toThrow('exit');
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.message).toContain(
      'vercel routes add --project explicit-routes'
    );
    expect(payload.message).toContain(
      'vercel routes update --project explicit-routes'
    );
    expect(
      payload.next.map(({ command }: { command: string }) => command)
    ).toEqual([
      'vercel routes list --project explicit-routes',
      'vercel routes add --project explicit-routes',
    ]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
    exitSpy.mockRestore();
    client.nonInteractive = false;
  });

  describe('--expand', () => {
    it('should show expanded route details with IDs', async () => {
      useRoutes(2);
      client.setArgv('routes', 'list', '--expand');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list --expand"').toEqual(0);
      // Expanded view shows route IDs in brackets - check that output includes ID format
      await expect(client.stderr).toOutput('[route-0]');
    });

    it('should show expanded details with -e shorthand', async () => {
      useRoutes(1);
      client.setArgv('routes', 'list', '-e');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list -e"').toEqual(0);
      await expect(client.stderr).toOutput('Route 0');
    });

    it('should show headers in expanded view', async () => {
      useRoutes(5); // Route 0 and 4 have headers (index % 4 === 0)
      client.setArgv('routes', 'list', '--expand');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list --expand"').toEqual(0);
      await expect(client.stderr).toOutput('Response Headers');
    });

    it('should show description in expanded view', async () => {
      useRoutes(2);
      client.setArgv('routes', 'list', '--expand');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list --expand"').toEqual(0);
      await expect(client.stderr).toOutput('Description for route');
    });

    it('should show syntax label in expanded view', async () => {
      useRoutes(2);
      client.setArgv('routes', 'list', '--expand');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list --expand"').toEqual(0);
      await expect(client.stderr).toOutput('Regex');
    });

    it('should show Enabled and Disabled status in table view', async () => {
      useRoutes(4); // Route 0: disabled (index%3===0), Route 1: enabled, Route 2: enabled, Route 3: disabled
      client.setArgv('routes', 'list');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list"').toEqual(0);
      // Route 0 is disabled, appears first in table; Route 1 is enabled
      await expect(client.stderr).toOutput('Disabled');
    });

    it('should show transforms in expanded view', async () => {
      useRoutes(1); // Route 0 has a request header transform
      client.setArgv('routes', 'list', '--expand');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list --expand"').toEqual(0);
      await expect(client.stderr).toOutput('Transforms');
    });

    it('should show conditions in expanded view', async () => {
      useRoutes(2); // Route 1 has a has condition
      client.setArgv('routes', 'list', '--expand');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list --expand"').toEqual(0);
      await expect(client.stderr).toOutput('Has conditions');
    });
  });

  it('writes routes and their version to stdout with --json', async () => {
    useRoutes(3);
    client.setArgv('routes', 'list', '--json');

    expect(await routes(client)).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.routes).toHaveLength(3);
    expect(result.version.id).toBe('current-version');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('Fetching routes');
    expect(stderr).not.toContain('found for');
  });

  describe('renamed options', () => {
    const version = {
      id: 'version-1',
      lastModified: 1,
      createdBy: 'user@example.com',
      isLive: false,
      isStaging: false,
      ruleCount: 1,
    };

    // Runs `routes list` with a fresh client, recording the routes request.
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
      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({ versions: [version] });
        }
      );
      let query: Record<string, unknown> | undefined;
      client.scenario.get('/v1/projects/:projectId/routes', (req, res) => {
        query = req.query;
        res.json({ routes: [], version });
      });
      client.setArgv('routes', 'list', ...args);
      const exitCode = await routes(client);
      return {
        exitCode,
        query,
        stdout: client.stdout.getFullOutput(),
        stderr: client.stderr.getFullOutput(),
      };
    }

    it.each([
      ['--search', ['--search', 'api'], ['--query', 'api'], { q: 'api' }],
      ['-s', ['-s', 'api'], ['--query', 'api'], { q: 'api' }],
      [
        '--filter',
        ['--filter', 'rewrite'],
        ['--type', 'rewrite'],
        { filter: 'rewrite' },
      ],
      ['-f', ['-f', 'rewrite'], ['--type', 'rewrite'], { filter: 'rewrite' }],
      [
        '--version-id',
        ['--version-id', 'version-1'],
        ['--routes-version', 'version-1'],
        { versionId: 'version-1' },
      ],
    ])('still accepts %s, with one warning', async (typed, oldArgs, newArgs, sent) => {
      const now = await run(...newArgs);
      const before = await run(...oldArgs);
      const name = newArgs[0];

      expect(now.exitCode).toBe(0);
      expect(now.query).toMatchObject(sent);
      expect(now.stderr).not.toContain('deprecated');
      expect(before.exitCode).toBe(now.exitCode);
      expect(before.query).toEqual(now.query);
      expect(before.stdout).toBe(now.stdout);
      expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
      expect(before.stderr).toContain(
        `! ${typed} is deprecated. Use ${name}.\n`
      );

      const nowJson = await run(...newArgs, '--json');
      const beforeJson = await run(...oldArgs, '--json');
      expect(beforeJson.exitCode).toBe(0);
      expectDeprecationInJson(
        beforeJson.stdout,
        nowJson.stdout,
        `${typed} is deprecated. Use ${name}.`
      );
      expect(beforeJson.stderr).not.toContain('deprecated');
    });

    it.each([
      [['-s', 'one', '--search', 'two'], { q: 'two' }],
      [['--search', 'one', '-s', 'two'], { q: 'two' }],
      [['-f', 'redirect', '--filter', 'rewrite'], { filter: 'rewrite' }],
    ])('keeps %j working, with the last value', async (args, sent) => {
      const result = await run(...args);

      expect(result.exitCode).toBe(0);
      expect(result.query).toMatchObject(sent);
      expect(result.stderr.match(/deprecated/g)).toHaveLength(1);
    });

    it.each([
      [['-s', 'api'], ['-s']],
      [['-f', 'rewrite'], ['-f']],
      [
        ['-s', 'api', '-f', 'rewrite'],
        ['-s', '-f'],
      ],
      [['--search', 'api', '--filter', 'rewrite'], []],
    ])('counts the old short flags in %j for telemetry', async (args, letters) => {
      await run(...args);

      expect(getUsedDeprecatedShorthands().sort()).toEqual(letters.sort());
    });

    it.each([
      [['--query', 'a', '--search', 'b'], "Can't use --query with --search."],
      [['--query', 'a', '-s', 'b'], "Can't use --query with -s."],
      [
        ['--type', 'rewrite', '--filter', 'rewrite'],
        "Can't use --type with --filter.",
      ],
      [['--type', 'rewrite', '-f', 'rewrite'], "Can't use --type with -f."],
      [
        ['--routes-version', 'version-1', '--version-id', 'version-1'],
        "Can't use --routes-version with --version-id.",
      ],
    ])('rejects %j before any request', async (args, message) => {
      const result = await run(...args);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(message);
      expect(result.query).toBeUndefined();
    });
  });
});

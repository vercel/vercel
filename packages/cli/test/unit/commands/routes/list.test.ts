import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import routes from '../../../../src/commands/routes';
import { useUser } from '../../../mocks/user';
import {
  useRoutes,
  useRouteVersions,
  useRoutesWithDiff,
} from '../../../mocks/routes';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

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
      await expect(exitCodePromise).resolves.toEqual(2);

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
    expect(exitCode, 'exit code for invalid filter').toEqual(1);
    await expect(client.stderr).toOutput('Invalid filter type');
  });

  it('should list staging routes with --staging flag', async () => {
    useRouteVersions(3);
    useRoutesWithDiff();
    client.setArgv('routes', 'list', '--staging');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list --staging"').toEqual(0);
    await expect(client.stderr).toOutput('Changes in staging version');
  });

  it('should show diff with added/removed/modified routes', async () => {
    useRouteVersions(3);
    useRoutesWithDiff();
    client.setArgv('routes', 'list', '--staging');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes list --staging"').toEqual(0);
    // Check that output contains diff markers - the toOutput checks the full accumulated output
    await expect(client.stderr).toOutput('Added (1)');
  });

  it('should reject --diff without --staging or --version', async () => {
    useRoutes(3);
    client.setArgv('routes', 'list', '--diff');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for invalid --diff usage').toEqual(1);
    await expect(client.stderr).toOutput(
      '--diff flag requires --staging or --version'
    );
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
      await expect(client.stderr).toOutput('Headers');
    });

    it('should show description in expanded view', async () => {
      useRoutes(2);
      client.setArgv('routes', 'list', '--expand');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for "routes list --expand"').toEqual(0);
      await expect(client.stderr).toOutput('Description for route');
    });
  });
});

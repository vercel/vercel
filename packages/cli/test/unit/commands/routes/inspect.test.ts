import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import routes from '../../../../src/commands/routes';
import { useUser } from '../../../mocks/user';
import { useRoutesForInspect, useRouteVersions } from '../../../mocks/routes';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('routes inspect', () => {
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
      const subcommand = 'inspect';

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

  it('should show error when no identifier provided', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for missing identifier').toEqual(1);
    await expect(client.stderr).toOutput('Missing route name or ID');
  });

  it('should inspect a route by exact name', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'Old page redirect');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for inspect by name').toEqual(0);
    await expect(client.stderr).toOutput('Route found');
  });

  it('should inspect a route by ID', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'route-redirect-123');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for inspect by ID').toEqual(0);
    await expect(client.stderr).toOutput('Route found');
  });

  it('should show headers in route details', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'Custom headers');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for inspect with headers').toEqual(0);
    await expect(client.stderr).toOutput('Headers');
  });

  it('should show disabled status', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'Custom headers');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for inspect disabled route').toEqual(0);
    await expect(client.stderr).toOutput('Disabled');
  });

  it('should show staged status', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'Custom headers');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for inspect staged route').toEqual(0);
    await expect(client.stderr).toOutput('Staged');
  });

  it('should show conditions', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'Auth protected');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for inspect with conditions').toEqual(0);
    await expect(client.stderr).toOutput('Conditions');
  });

  it('should show interactive selection when multiple matches', async () => {
    useRoutesForInspect();
    // Search for 'route' which matches all route IDs
    client.setArgv('routes', 'inspect', 'route');

    // Mock the select input to return the first route ID
    client.input.select = vi.fn().mockResolvedValue('route-redirect-123');

    const exitCode = await routes(client);
    expect(exitCode, 'exit code for ambiguous search with selection').toEqual(
      0
    );
    await expect(client.stderr).toOutput('Found 3 routes matching');
  });

  it('should show error when no routes match', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'nonexistent-route');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for no match').toEqual(1);
    await expect(client.stderr).toOutput('No route found matching');
  });

  it('tracks subcommand invocation', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'Old page redirect');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes inspect"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
    ]);
  });

  describe('--staging', () => {
    it('should inspect route from staging version', async () => {
      useRouteVersions(3);
      useRoutesForInspect();
      client.setArgv('routes', 'inspect', 'Old page redirect', '--staging');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for inspect --staging').toEqual(0);
      await expect(client.stderr).toOutput('Route found');
    });

    it('should show error when no staging version exists', async () => {
      // Set up versions endpoint with only live version (no staging)
      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({
            versions: [
              {
                id: 'live-version',
                s3Key: 'routes/live.json',
                lastModified: Date.now(),
                createdBy: 'user@example.com',
                isLive: true,
                ruleCount: 5,
              },
            ],
          });
        }
      );
      client.setArgv('routes', 'inspect', 'some-route', '--staging');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for no staging').toEqual(1);
      await expect(client.stderr).toOutput('No staging version found');
    });
  });
});

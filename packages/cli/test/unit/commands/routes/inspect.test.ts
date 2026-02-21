import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import routes from '../../../../src/commands/routes';
import { useUser } from '../../../mocks/user';
import {
  useRoutesForInspect,
  useRoutesForInspectDiff,
} from '../../../mocks/routes';
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
    await expect(client.stderr).toOutput('Response Headers');
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

  it('should show srcSyntax label', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'Old page redirect');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for inspect with syntax').toEqual(0);
    await expect(client.stderr).toOutput('Exact Match');
  });

  it('should show transforms in route details', async () => {
    useRoutesForInspect();
    client.setArgv('routes', 'inspect', 'API transforms');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for inspect with transforms').toEqual(0);
    await expect(client.stderr).toOutput('Request Header');
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
    await expect(client.stderr).toOutput('Found 4 routes matching');
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

  describe('--diff', () => {
    it('should show changes for a modified route', async () => {
      useRoutesForInspectDiff();
      client.setArgv('routes', 'inspect', 'API Proxy', '--diff');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for inspect --diff').toEqual(0);
      await expect(client.stderr).toOutput('modified');
    });

    it('should show changed destination in diff', async () => {
      useRoutesForInspectDiff();
      client.setArgv('routes', 'inspect', 'API Proxy', '--diff');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      // Should show the old and new destination
      await expect(client.stderr).toOutput('v2.api.example.com');
    });

    it('should show new route indicator', async () => {
      useRoutesForInspectDiff();
      client.setArgv('routes', 'inspect', 'New Route', '--diff');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for inspect --diff new route').toEqual(0);
      await expect(client.stderr).toOutput('new');
    });

    it('should show normal route when no changes', async () => {
      // Use the standard inspect mock — same routes returned for both staging and production
      useRoutesForInspect();
      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({
            versions: [
              {
                id: 'live-version',
                isLive: true,
                isStaging: false,
                ruleCount: 4,
              },
            ],
          });
        }
      );
      client.setArgv('routes', 'inspect', 'Old page redirect', '--diff');
      const exitCode = await routes(client);
      expect(exitCode, 'exit code for inspect --diff no changes').toEqual(0);
      // Route is identical in both versions, so show "No staged changes"
      await expect(client.stderr).toOutput('No staged changes');
    });
  });
});

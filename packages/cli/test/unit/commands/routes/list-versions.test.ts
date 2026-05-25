import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import routes from '../../../../src/commands/routes';
import { useUser } from '../../../mocks/user';
import { useRouteVersions } from '../../../mocks/routes';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

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
      await expect(exitCodePromise).resolves.toEqual(2);

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
    expect(exitCode, 'exit code for invalid count').toEqual(1);
    await expect(client.stderr).toOutput('Count must be between 1 and 100');
  });

  it('should reject invalid count (too high)', async () => {
    useRouteVersions(5);
    client.setArgv('routes', 'list-versions', '--count', '150');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for invalid count').toEqual(1);
    await expect(client.stderr).toOutput('Count must be between 1 and 100');
  });
});

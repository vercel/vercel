import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import routes from '../../../../src/commands/routes';
import { useUser } from '../../../mocks/user';
import {
  useUpdateRouteVersion,
  useRoutesWithDiffForPublish,
} from '../../../mocks/routes';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('routes restore', () => {
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
      const subcommand = 'restore';

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

  it('should require version-id argument', async () => {
    useUpdateRouteVersion();
    client.setArgv('routes', 'restore');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for missing argument').toEqual(1);
    await expect(client.stderr).toOutput(
      'Missing required argument: version-id'
    );
  });

  it('should restore previous version with --yes', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'restore', 'previous-version', '--yes');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes restore --yes"').toEqual(0);
    await expect(client.stderr).toOutput('Success!');
  });

  it('should show diff before restoring', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'restore', 'previous-version', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Changes to be restored:');
  });

  it('should error when version not found', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'restore', 'nonexistent-version', '--yes');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for nonexistent version').toEqual(1);
    await expect(client.stderr).toOutput('"nonexistent-version" not found');
  });

  it('should error when version is already live', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'restore', 'live-version', '--yes');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for live version').toEqual(1);
    await expect(client.stderr).toOutput('is currently live');
  });

  it('should error when version is staging', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'restore', 'staging-version', '--yes');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for staging version').toEqual(1);
    await expect(client.stderr).toOutput('is staged');
  });

  it('tracks subcommand invocation', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'restore', 'previous-version', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:restore',
        value: 'restore',
      },
    ]);
  });

  it('should prompt for confirmation and cancel when declined', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'restore', 'previous-version');
    // Simulate user declining confirmation
    client.input.confirm = vi.fn().mockResolvedValue(false);

    const exitCode = await routes(client);
    expect(exitCode, 'exit code when canceled').toEqual(0);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('should proceed when user confirms', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'restore', 'previous-version');
    // Simulate user confirming
    client.input.confirm = vi.fn().mockResolvedValue(true);

    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Success!');
  });

  it('should accept partial version IDs', async () => {
    useUpdateRouteVersion({
      versions: [
        { id: 'abc12345-6789-abcd-ef00-111111111111', isLive: true },
        { id: 'def12345-6789-abcd-ef00-222222222222', isStaging: false },
      ],
    });
    useRoutesWithDiffForPublish();
    // Use partial ID matching the truncated display (12 chars)
    client.setArgv('routes', 'restore', 'def12345-678', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Success!');
  });

  it('should error when partial ID matches multiple versions', async () => {
    useUpdateRouteVersion({
      versions: [
        { id: 'abc12345-6789-abcd-ef00-111111111111', isLive: true },
        { id: 'abc12345-6789-abcd-ef00-222222222222', isStaging: false },
        { id: 'abc12345-6789-abcd-ef00-333333333333', isStaging: false },
      ],
    });
    useRoutesWithDiffForPublish();
    // Partial ID matches multiple versions
    client.setArgv('routes', 'restore', 'abc12345', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Multiple versions match');
  });
});

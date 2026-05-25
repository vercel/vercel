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

describe('routes publish', () => {
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
      const subcommand = 'publish';

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

  it('should auto-find staging version and publish with --yes', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'publish', '--yes');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code for "routes publish --yes"').toEqual(0);
    await expect(client.stderr).toOutput('Success!');
  });

  it('should show diff before publishing', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'publish', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Changes to be published:');
    await expect(client.stderr).toOutput('Added route');
    await expect(client.stderr).toOutput('Deleted route');
    await expect(client.stderr).toOutput('Modified route');
    await expect(client.stderr).toOutput('Reordered route');
    await expect(client.stderr).toOutput('Enabled');
    await expect(client.stderr).toOutput('Disabled');
  });

  it('should show reorder info in diff', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'publish', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    // Check for reorder info (position 6 -> 4, displayed as 1-indexed)
    await expect(client.stderr).toOutput('Reordered (6 → 4)');
  });

  it('should warn when no staging version exists', async () => {
    useUpdateRouteVersion({
      versions: [{ id: 'live-version', isLive: true }],
    });
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'publish', '--yes');
    const exitCode = await routes(client);
    expect(exitCode, 'exit code when no staging').toEqual(0);
    await expect(client.stderr).toOutput('No staged changes to publish');
  });

  it('tracks subcommand invocation', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'publish', '--yes');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:publish',
        value: 'publish',
      },
    ]);
  });

  it('non-interactive without --yes outputs JSON confirmation_required and exits', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    client.nonInteractive = true;
    client.setArgv('routes', 'publish', '--non-interactive');

    await routes(client);

    expect(logSpy).toHaveBeenCalled();
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.status).toBe('error');
    expect(payload.reason).toBe('confirmation_required');
    expect(payload.next?.length).toBeGreaterThanOrEqual(1);
    expect(
      payload.next.some((n: { command: string }) => n.command.includes('--yes'))
    ).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    exitSpy.mockRestore();
    client.nonInteractive = false;
  });

  it('should prompt for confirmation and cancel when declined', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'publish');
    // Simulate user declining confirmation
    client.input.confirm = vi.fn().mockResolvedValue(false);

    const exitCode = await routes(client);
    expect(exitCode, 'exit code when canceled').toEqual(0);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('should proceed when user confirms', async () => {
    useUpdateRouteVersion();
    useRoutesWithDiffForPublish();
    client.setArgv('routes', 'publish');
    // Simulate user confirming
    client.input.confirm = vi.fn().mockResolvedValue(true);

    const exitCode = await routes(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Success!');
  });
});

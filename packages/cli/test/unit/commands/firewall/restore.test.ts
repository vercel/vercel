import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useGetFirewallConfig,
  useActivateConfig,
  capturedRequests,
  createConfig,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall restore', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    const cwd = setupUnitFixture('commands/firewall');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'restore', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:restore',
        },
      ]);
    });
  });

  it('should error when no version is provided', async () => {
    client.setArgv('firewall', 'restore');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput(
      'A configuration version is required.'
    );
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when version is not a positive integer', async () => {
    client.setArgv('firewall', 'restore', 'abc', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Invalid configuration version "abc"');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when the version is not found', async () => {
    useGetFirewallConfig(null);

    client.setArgv('firewall', 'restore', '999', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput(
      'Firewall configuration version 999 was not found'
    );
    expect(await exitCodePromise).toEqual(1);
    expect(capturedRequests.activate).toBeUndefined();
  });

  it('should restore a version with --yes', async () => {
    useGetFirewallConfig(createConfig({ version: 5 }));
    useActivateConfig();

    client.setArgv('firewall', 'restore', '5', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('restored to production');
    expect(await exitCodePromise).toEqual(0);
    expect(capturedRequests.activate).toEqual({ version: '5' });
  });

  it('should show what will be restored before confirming', async () => {
    useGetFirewallConfig(createConfig({ version: 7 }));
    useActivateConfig();

    client.setArgv('firewall', 'restore', '7', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput(
      'Restore firewall configuration version 7'
    );
    expect(await exitCodePromise).toEqual(0);
  });

  it('should cancel when the user declines the confirmation', async () => {
    useGetFirewallConfig(createConfig({ version: 5 }));
    useActivateConfig();

    client.setArgv('firewall', 'restore', '5');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Restore version 5 to production?');
    client.stdin.write('n\n');
    await expect(client.stderr).toOutput('Canceled');
    expect(await exitCodePromise).toEqual(0);
    expect(capturedRequests.activate).toBeUndefined();
  });

  it('should restore when the user accepts the confirmation', async () => {
    useGetFirewallConfig(createConfig({ version: 5 }));
    useActivateConfig();

    client.setArgv('firewall', 'restore', '5');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Restore version 5 to production?');
    client.stdin.write('y\n');
    await expect(client.stderr).toOutput('restored to production');
    expect(await exitCodePromise).toEqual(0);
    expect(capturedRequests.activate).toEqual({ version: '5' });
  });

  it('should error in non-interactive mode without --yes', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.nonInteractive = true;
    useGetFirewallConfig(createConfig({ version: 5 }));
    useActivateConfig();

    client.setArgv('firewall', 'restore', '5');
    await expect(firewall(client)).rejects.toThrow('exit:1');

    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload.status).toBe('error');
    expect(payload.reason).toBe('confirmation_required');
    expect(payload.next?.[0]?.command).toContain('firewall restore 5 --yes');
    expect(capturedRequests.activate).toBeUndefined();
  });

  it('tracks subcommand telemetry', async () => {
    useGetFirewallConfig(createConfig({ version: 5 }));
    useActivateConfig();

    client.setArgv('firewall', 'restore', '5', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('restored to production');
    expect(await exitCodePromise).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:restore',
        value: 'restore',
      },
    ]);
  });
});

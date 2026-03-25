import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useGetBypass,
  createConfig,
  createRule,
  createIpRule,
  createBypassRule,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall status', () => {
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
      client.setArgv('firewall', 'status', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:status',
        },
      ]);
    });
  });

  it('should show firewall status when enabled with rules', async () => {
    const active = createConfig({
      firewallEnabled: true,
      rules: [createRule(1), createRule(2), createRule(3)],
      ips: [createIpRule(1), createIpRule(2)],
    });
    useListFirewallConfigs(active, null);
    useGetBypass([createBypassRule(1)]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('2 active, 1 inactive (3 total)');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show firewall status when disabled', async () => {
    const active = createConfig({
      firewallEnabled: false,
      rules: [],
      ips: [],
    });
    useListFirewallConfigs(active, null);
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Disabled');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show pending draft changes', async () => {
    const active = createConfig({ firewallEnabled: true });
    const draft = createConfig({
      id: 'config_draft',
      changes: [
        createChange('rules.insert', {
          value: { name: 'New Rule' },
        }),
        createChange('ip.insert', {
          value: { ip: '1.2.3.4' },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('2 unpublished changes');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show not configured when no active config', async () => {
    useListFirewallConfigs(null, null);
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Not configured');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should output JSON with --json flag', async () => {
    const active = createConfig({ firewallEnabled: true });
    useListFirewallConfigs(active, null);
    useGetBypass([]);

    client.setArgv('firewall', 'status', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
  });
});

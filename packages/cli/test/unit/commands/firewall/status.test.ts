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
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';

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
      managedRules: {
        bot_filter: { active: true, action: 'challenge' },
        ai_bots: { active: true, action: 'log' },
        owasp: {
          active: true,
          action: 'deny',
          ruleGroups: {
            sqli: { active: true },
            xss: { active: true },
            lfi: { active: false },
            rce: { active: true },
          },
        },
      },
    });
    useListFirewallConfigs(active, null);
    useGetBypass([createBypassRule(1)]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('2 active, 1 inactive (3 total)');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Enabled');
    expect(fullOutput).toMatch(/Bot Protection:\s+Challenge/);
    expect(fullOutput).toMatch(/AI Bots:\s+Log/);
    expect(fullOutput).toMatch(/OWASP Ruleset:\s+On \(3 of 4 groups\)/);
    expect(fullOutput).not.toContain('requires Security+');
  });

  it('notes that OWASP requires Security+ when it is off', async () => {
    const active = createConfig({
      firewallEnabled: true,
      managedRules: {
        owasp: { active: false },
      },
    });
    useListFirewallConfigs(active, null);
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('requires Security+');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toMatch(/OWASP Ruleset:\s+Off\s+· requires Security\+/);
  });

  it('shows the status for the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'explicit-firewall',
      name: 'explicit-firewall',
      accountId: 'team_dummy',
    });
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    client.setArgv('firewall', 'status', '--project', 'explicit-firewall');

    await expect(firewall(client)).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Enabled');
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

  it('renders an execution graph with bypass paths for --graph', async () => {
    const active = createConfig({
      firewallEnabled: true,
      botIdEnabled: true,
      rules: [createRule(1), createRule(2)],
      ips: [createIpRule(1), createIpRule(2), createIpRule(3)],
      managedRules: {
        bot_filter: { active: true, action: 'challenge' },
        ai_bots: { active: true, action: 'log' },
        owasp: { active: true },
        traffic_sources: { active: false },
      },
    });
    useListFirewallConfigs(active, null);
    useGetBypass([
      createBypassRule(1),
      createBypassRule(2),
      createBypassRule(3),
    ]);

    client.setArgv('firewall', 'status', '--graph');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('system bypass');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('3 System Bypass IPs');
    expect(fullOutput).toContain('Bot Management');
    expect(fullOutput).not.toContain('Bot Protection:');
  });

  it('rejects --json and --graph together', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);

    client.setArgv('firewall', 'status', '--json', '--graph');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Cannot use --json and --graph together'
    );
  });

  it('should show pending draft changes with content details', async () => {
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
    await expect(client.stderr).toOutput('Added IP block 1.2.3.4');
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
    const active = createConfig({
      firewallEnabled: true,
      managedRules: {
        bot_protection: { active: true, action: 'log' },
        ai_bots: { active: true, action: 'deny' },
        owasp: { active: false },
      },
    });
    useListFirewallConfigs(active, null);
    useGetBypass([]);

    client.setArgv('firewall', 'status', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);

    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.botProtection).toEqual({ enabled: true, action: 'log' });
    expect(payload.aiBots).toEqual({ enabled: true, action: 'deny' });
    expect(payload.owasp).toEqual({
      enabled: false,
      action: null,
      requiresUpgrade: true,
      upgrade: 'security-plus',
    });
  });
});
